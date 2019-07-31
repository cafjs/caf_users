'use strict';
/**
 * A plug to access a user management service backend based on Redis.
 *
 * @module caf_users/plug_users
 * @augments module:caf_redis/gen_redis_plug
 */
// @ts-ignore: augments not attached to a class

var assert = require('assert');
var util = require('util');
var genRedisPlug = require('caf_redis').gen_redis_plug;
var json_rpc = require('caf_transport').json_rpc;

const USER_PREFIX = 'user:';

const USER_MAP = USER_PREFIX + 'users';

const APP_MAP = USER_PREFIX + 'apps';

const CAS_MAP = USER_PREFIX + 'cas';

const NONCE_MAP = USER_PREFIX + 'nonces';

const REPUTATION_MAP_PREFIX = USER_PREFIX + 'reputationMap';

const APPS_SET_PREFIX = USER_PREFIX + 'appsSet';

const CAS_SET_PREFIX = USER_PREFIX + 'casSet';

const OFFERS_SET_PREFIX = USER_PREFIX + 'offersSet';

const ACCEPTS_SET_PREFIX = USER_PREFIX + 'acceptsSet';

const TRANSFER_PREFIX = 'transfer:transfer';

/*
 * Registers a new user with default units. Does nothing if user already exists.
 *
 * KEYS[1] users map name
 * KEYS[2] users reputation map name
 * ARGV[1] user
 * ARGV[2] default units
 * ARGV[3] creation date key
 * ARGV[4] creation date
 * ARGV[5] completed key
 * ARGV[6] completed value
 * ARGV[7] disputed key
 * ARGV[8] disputed value
 * ARGV[9] expired key
 * ARGV[10] expired value
 *
 */
/*eslint-disable */
var luaRegisterUser =
'if redis.call("hexists", KEYS[1], ARGV[1]) == 0 then \
   redis.call("hset", KEYS[1], ARGV[1], ARGV[2]) \
 end \
if redis.call("hexists", KEYS[2], ARGV[3]) == 0 then \
   redis.call("hset", KEYS[2], ARGV[3], ARGV[4]) \
   redis.call("hset", KEYS[2], ARGV[5], ARGV[6]) \
   redis.call("hset", KEYS[2], ARGV[7], ARGV[8]) \
   redis.call("hset", KEYS[2], ARGV[9], ARGV[10]) \
 end \
';
/*eslint-enable*/

/*
 * Registers a new app. Does nothing if user already exists.
 *
 * KEYS[1] apps set for this user
 * KEYS[2] app map name
 * KEYS[3] user map name
 * ARGV[1] app name
 * ARGV[2] default time in days per cost unit
 * ARGV[3] cost in units for publishing app
 * ARGV[4] the app publisher
 *
 */
/*eslint-disable */
var luaRegisterApp =
'if redis.call("hexists", KEYS[2], ARGV[1]) == 0 then \
   local cost = tonumber(ARGV[3]) \
   local ownerBalance = redis.call("hget", KEYS[3], ARGV[4]) \
   ownerBalance = tonumber(ownerBalance) \
   if not ownerBalance or (ownerBalance < cost) then \
     return { err = "User does not have enough balance."} \
   else \
     redis.call("hincrbyfloat", KEYS[3], ARGV[4], "-" .. ARGV[3]) \
     redis.call("sadd", KEYS[1], ARGV[1]) \
     redis.call("hset", KEYS[2], ARGV[1], ARGV[2]) \
   end \
 end ';
/*eslint-enable*/

/*
 * Registers a new CA.
 *
 * If CA already exists and it has not expired, it does nothing.
 *
 * Otherwise, it calculates the time per cost unit and updates:
 *     1) owner and app writer balance.
 *     2) New termination time.
 *     3) Set of CAs for the owner (if needed)
 *
 * Missing app or not enough balance returns error.
 *
 * KEYS[1] user map name
 * KEYS[2] app map name
 * KEYS[3] CA map name
 * KEYS[4] CAs set for this user
 * ARGV[1] App writer name
 * ARGV[2] CA owner
 * ARGV[3] ca identifier
 * ARGV[4] units to add to app writer
 * ARGV[5] current time
 * ARGV[6] App name
 *
 */
/*eslint-disable */
var luaRegisterCA =
'local expireTime = redis.call("hget", KEYS[3], ARGV[3]) \
if not expireTime or tonumber(expireTime) < tonumber(ARGV[5]) then \
 local extraTime = redis.call("hget", KEYS[2], ARGV[6]) \
 if not extraTime then \
     return { err = "App does not exist."} \
 else \
   local ownerBalance = redis.call("hget", KEYS[1], ARGV[2]) \
   ownerBalance = tonumber(ownerBalance) \
   if not ownerBalance or (ownerBalance < 1) then \
     return { err = "User does not have enough balance."} \
   else \
     redis.call("hincrbyfloat", KEYS[1], ARGV[2], "-1.0") \
     redis.call("hincrbyfloat", KEYS[1], ARGV[1], ARGV[4]) \
     local newExpireTime =  tonumber(ARGV[5]) + tonumber(extraTime) \
     redis.call("hset", KEYS[3], ARGV[3], tostring(newExpireTime)) \
     redis.call("sadd", KEYS[4], ARGV[3]) \
     return newExpireTime \
   end \
 end \
else \
  return tonumber(expireTime) \
end ';
/*eslint-enable*/

/*
 * Checks that a CA has not expired. Returns -1 if expired or expected expire
 * time.
 *
 *
 * KEYS[1] CA map name
 * ARGV[1] ca identifier
 * ARGV[2] current time
 */
/*eslint-disable */
var luaCheckCA =
'local expireTime = redis.call("hget", KEYS[1], ARGV[1]) \
if not expireTime or tonumber(expireTime) < tonumber(ARGV[2]) then \
     return -1 \
else \
  return tonumber(expireTime) \
end ';
/*eslint-enable*/


/*
 * Adds units to a user. If nonce is not fresh, it ignores request.
 *
 * KEYS[1] nonce name
 * KEYS[2] users map name
 * ARGV[1] nonce
 * ARGV[2] user
 * ARGV[3] extra units
 *
 */
/*eslint-disable */
var luaAddUnits =
'local nonce = redis.call("hget", KEYS[1], ARGV[2]) \
 if nonce ~= ARGV[1] then \
    redis.call("hset", KEYS[1], ARGV[2], ARGV[1]) \
    redis.call("hincrbyfloat", KEYS[2], ARGV[2], ARGV[3]) \
 end ';
/*eslint-enable*/

/*
 * Removes units from a user. If nonce is not fresh, it ignores request.
 *
 * If there are not enough units, it returns an error without changing the
 * balance.
 * KEYS[1] nonce name
 * KEYS[2] users map name
 * ARGV[1] nonce
 * ARGV[2] user
 * ARGV[3] units to remove
 *
 */
/*eslint-disable */
var luaRemoveUnits =
'local nonce = redis.call("hget", KEYS[1], ARGV[2]) \
 if nonce ~= ARGV[1] then \
    redis.call("hset", KEYS[1], ARGV[2], ARGV[1]) \
    local balance = redis.call("hget", KEYS[2], ARGV[2]) \
    if not balance then \
        return { err = "User does not exist."} \
    elseif tonumber(balance) < tonumber(ARGV[3]) then \
        return { err = "Not enough balance."} \
    else \
        return redis.call("hincrbyfloat", KEYS[2], ARGV[2], "-" .. ARGV[3]) \
    end \
 end ';
/*eslint-enable*/

/*
 * List users
 *
 * KEYS[1] users map name
 *
 */
var luaListUsers = 'return redis.call("hkeys", KEYS[1])';

/*
 * List apps for a user
 *
 * KEYS[1] name of user app set
 * KEYS[2] name of app map
 *
 */
var luaListApps = 'local all = redis.call("smembers", KEYS[1]) \
local result = {} \
for i =1, #all, 1 do \
  table.insert(result, all[i]) \
  table.insert(result,  redis.call("hget", KEYS[2], all[i])) \
end \
return result';

/*
 * List pending offers for a user. The values are JSON encoded strings
 * representing a list with key/values.
 *
 * Note that cjson.encode maps an empty array to an empty object.
 *
 * KEYS[1] name of user offers set
 *
 */
var luaListOffers = 'local all = redis.call("smembers", KEYS[1]) \
local result = {} \
for i =1, #all, 1 do \
  table.insert(result, all[i]) \
  table.insert(result,  cjson.encode(redis.call("hgetall", all[i]))) \
end \
return result';


/*
 * Describe a user
 *
 * KEYS[1] name of use map
 * ARGV[1] user
 *
 */
var luaDescribeUser = 'return redis.call("hget", KEYS[1], ARGV[1])';

/*
 * Describe the user's reputation
 *
 * KEYS[1] name of reputation map
 *
 */
var luaDescribeReputation = 'return redis.call("hgetall", KEYS[1])';

/*
 * First stage of a transfer of units (Created).
 *
 *  Created  ---> Released ---> Accepted
 *    | |             |
 *    | |-> Expired<--|
 *    |
 *    |----> Disputed
 *
 * Where Accepted, Expired, and Disputed are final stages that affect
 * reputation as (+1,+1), (0,0) and (-1, -1), respectively.
 *
 * *Accepted* transfers the units, the others states do not.
 *
 * *Disputed* will be a logical reaction to paying but the units are not
 * released. It should get triggered before expiration.
 * It affects the reputation of both parties equally, because we have no way to
 * validate fraud claims.
 *
 * The logic is that reputable partners will be careful to only
 * deal with "reliable" partners, and in the long run, that will limit fraud.
 * However, a single transaction can always be fraudulent, and this encourages
 * making many low value transactions.
 *
 * KEYS[1] nonce name
 * KEYS[2] user map name
 * KEYS[3] FROM user offers set
 * KEYS[4] TO user accepts set
 * KEYS[5] Transfer map name
 *
 * ARGV[1] nonce to make operation idempotent
 * ARGV[2] FROM
 * ARGV[3] TO
 * ARGV[4] units
 * ARGV[5] expires
 */
var luaTransferUnits =
'local nonce = redis.call("hget", KEYS[1], ARGV[2]) \
 if nonce ~= ARGV[1] then \
   redis.call("hset", KEYS[1], ARGV[2], ARGV[1]) \
   local ownerBalance = redis.call("hget", KEYS[2], ARGV[2]) \
   ownerBalance = tonumber(ownerBalance) \
   local units = tonumber(ARGV[4]) \
   if not ownerBalance or (ownerBalance < units) then \
     return { err = "User does not have enough balance."} \
   else \
      redis.call("hincrbyfloat", KEYS[2], ARGV[2], "-" .. ARGV[4]) \
      redis.call("sadd", KEYS[3], KEYS[5]) \
      redis.call("sadd", KEYS[4], KEYS[5]) \
      redis.call("hset", KEYS[5], "from", ARGV[2]) \
      redis.call("hset", KEYS[5], "to", ARGV[3]) \
      redis.call("hset", KEYS[5], "units", ARGV[4]) \
      redis.call("hset", KEYS[5], "expires", ARGV[5]) \
      redis.call("hset", KEYS[5], "released", "false") \
   end \
 end ';

/*
 * Second stage of a transfer of units (Release).
 *
 * KEYS[1] FROM user offers set
 * KEYS[2] Transfer map name
 *
 * ARGV[1] FROM
 */
var luaReleaseTransfer =
'if redis.call("sismember", KEYS[1], KEYS[2]) == 1 then \
   local from = redis.call("hget", KEYS[2], "from") \
   if from == ARGV[1] then \
      redis.call("hset", KEYS[2], "released", "true") \
   else \
     return { err = "User does not match in release."} \
   end \
 end ';

/*
 * Force expiration of the transfer.
 *
 * KEYS[1] user map name
 * KEYS[2] FROM user offers set
 * KEYS[3] TO user accepts set
 * KEYS[4] Transfer map name
 * KEYS[5] FROM Reputation map
 * KEYS[6] TO Reputation map
 *
 * ARGV[1] FROM
 * ARGV[2] units
 * ARGV[3] now
 */
var luaExpireTransfer =
'local from = redis.call("hget", KEYS[4], "from") \
 if from == ARGV[1] then \
    local expires = redis.call("hget", KEYS[4], "expires") \
    local now = tonumber(ARGV[3]) \
    expires = tonumber(expires) \
    if (now < expires) then \
       return { err = "Transfer has not expired yet."} \
    else \
       redis.call("hincrbyfloat", KEYS[1], ARGV[1], ARGV[2]) \
       redis.call("srem", KEYS[2], KEYS[4]) \
       redis.call("srem", KEYS[3], KEYS[4]) \
       redis.call("hincrbyfloat", KEYS[5], "expired", "1.0") \
       redis.call("hincrbyfloat", KEYS[6], "expired", "1.0") \
       redis.call("del", KEYS[4]) \
    end \
 end ';

/*
 * Last stage of the transfer when successful (Accept).
 *
 * KEYS[1] user map name
 * KEYS[2] FROM user offers set
 * KEYS[3] TO user accepts set
 * KEYS[4] Transfer map name
 * KEYS[5] FROM Reputation map
 * KEYS[6] TO Reputation map
 *
 * ARGV[1] TO
 * ARGV[2] units
 */
var luaAcceptTransfer =
'local to = redis.call("hget", KEYS[4], "to") \
 if to == ARGV[1] then \
    local released = redis.call("hget", KEYS[4], "released") \
    if released == "true" then \
      redis.call("hincrbyfloat", KEYS[1], ARGV[1], ARGV[2]) \
      redis.call("srem", KEYS[2], KEYS[4]) \
      redis.call("srem", KEYS[3], KEYS[4]) \
      redis.call("hincrbyfloat", KEYS[5], "completed", "1.0") \
      redis.call("hincrbyfloat", KEYS[6], "completed", "1.0") \
      redis.call("del", KEYS[4]) \
    else \
      return { err = "Accept without a previous release."} \
    end \
 end ';

/*
 * Last stage of the transfer when fraud was reported (Dispute).
 *
 * KEYS[1] user map name
 * KEYS[2] FROM user offers set
 * KEYS[3] TO user accepts set
 * KEYS[4] Transfer map name
 * KEYS[5] FROM Reputation map
 * KEYS[6] TO Reputation map
 *
 * ARGV[1] FROM
 * ARGV[2] units
 * ARGV[3] TO
 */
var luaDisputeTransfer =
'local to = redis.call("hget", KEYS[4], "to") \
 if to == ARGV[3] then \
    local released = redis.call("hget", KEYS[4], "released") \
    if released ~= "true" then \
      redis.call("hincrbyfloat", KEYS[1], ARGV[1], ARGV[2]) \
      redis.call("srem", KEYS[2], KEYS[4]) \
      redis.call("srem", KEYS[3], KEYS[4]) \
      redis.call("hincrbyfloat", KEYS[5], "disputed", "1.0") \
      redis.call("hincrbyfloat", KEYS[6], "disputed", "1.0") \
      redis.call("del", KEYS[4]) \
    else \
      return { err = "Dispute after release."} \
    end \
 end ';

var luaAll = {
    registerUser: luaRegisterUser,
    registerApp: luaRegisterApp,
    registerCA: luaRegisterCA,
    checkCA: luaCheckCA,
    addUnits: luaAddUnits,
    removeUnits: luaRemoveUnits,
    transferUnits: luaTransferUnits,
    releaseTransfer: luaReleaseTransfer,
    expireTransfer: luaExpireTransfer,
    acceptTransfer: luaAcceptTransfer,
    disputeTransfer: luaDisputeTransfer,
    listUsers: luaListUsers,
    listApps: luaListApps,
    listCAs: luaListApps, // same implementation, different key
    listOffers: luaListOffers,
    listAccepts: luaListOffers, // same implementation, different key
    describeReputation: luaDescribeReputation,
    describeTransfer: luaDescribeReputation, // same implem, different key
    describeUser: luaDescribeUser,
    describeApp: luaDescribeUser, // same implementation, different key
    describeCA: luaDescribeUser // same implementation, different key

};

exports.newInstance = async function($, spec) {
    try {
        $._.$.log && $._.$.log.debug('New Users plug');

        var that = genRedisPlug.constructor($, spec);

        var appName = ($._.__ca_getAppName__ && $._.__ca_getAppName__()) ||
                spec.env.appName;

        assert.equal(typeof(appName), 'string',
                     "'appName' is not a string");

        var userMap = json_rpc.joinName(USER_MAP, appName);
        var appMap = json_rpc.joinName(APP_MAP, appName);
        var casMap = json_rpc.joinName(CAS_MAP, appName);
        var nonceMap = json_rpc.joinName(NONCE_MAP, appName);
        var appsSetPrefix = json_rpc.joinName(APPS_SET_PREFIX, appName) + ':';
        var casSetPrefix = json_rpc.joinName(CAS_SET_PREFIX, appName) + ':';
        var offersSetPrefix = json_rpc.joinName(OFFERS_SET_PREFIX, appName) +
                ':';
        var acceptsSetPrefix = json_rpc.joinName(ACCEPTS_SET_PREFIX, appName) +
                ':';
        var reputationMapPrefix = json_rpc.joinName(REPUTATION_MAP_PREFIX,
                                                    appName) + ':';
        var transferPrefix = json_rpc.joinName(TRANSFER_PREFIX, appName) + ':';

        assert.equal(typeof(spec.env.defaultUnits), 'number',
                     "'spec.env.defaultUnits' is not a number");
        var defaultUnits = spec.env.defaultUnits;

        assert.equal(typeof(spec.env.defaultTimePerUnit), 'number',
                     "'spec.env.defaultTimePerUnit' is not a number");
        var defaultTimePerUnit = spec.env.defaultTimePerUnit;

        assert.equal(typeof(spec.env.defaultHoldTimeInSec), 'number',
                     "'spec.env.defaultHoldTimeInSec' is not a number");
        var defaultHoldTimeInSec = spec.env.defaultHoldTimeInSec;

        assert.equal(typeof(spec.env.appWriterFraction), 'number',
                     "'spec.env.appWriterFraction' is not a number");
        var appWriterFraction = spec.env.appWriterFraction;

        assert.equal(typeof(spec.env.appPublishCost), 'number',
                     "'spec.env.appPublishCost' is not a number");
        var appPublishCost = spec.env.appPublishCost;

        var preRegisterUsers = [];
        if (spec.env.preRegisterUsers) {
            assert(Array.isArray(spec.env.preRegisterUsers),
                   "'spec.env.preRegisterUsers' is not an array of strings");
            preRegisterUsers = spec.env.preRegisterUsers;
        }

        var preRegisterApp = [];
        if (spec.env.preRegisterApp) {
            assert(Array.isArray(spec.env.preRegisterApp),
                   "'spec.env.preRegisterApp' is not an array of strings");
            preRegisterApp = spec.env.preRegisterApp;
        }


        var doLuaAsync = util.promisify(that.__ca_doLuaOp__);
        var initClientAsync = util.promisify(that.__ca_initClient__);

        var arrayToObject = function(arr, f) {
            var res = {};
            var key = null;
            for (var i=0; i<arr.length; i++) {
                if (i%2 === 0) {
                    key = arr[i];
                } else {
                    res[key] = f(arr[i], key);
                }
            }
            return res;
        };

        var decodeTransferValues = function(x) {
            var result = JSON.parse(x);
            if (Array.isArray(result)) {
                return arrayToObject(result, (x, key) => {
                    if (key === 'expires') {
                        return parseInt(x);
                    } else if (key === 'units') {
                        return parseFloat(x);
                    } else if (key === 'released') {
                        return (x === 'true');
                    } else {
                        return x;
                    }
                });
            } else {
                // cjson.encode maps an empty array to an empty object.
                return null;
            }
        };

        var decodeReputationValues = function(x, key) {
            if ((key === 'completed') || (key === 'disputed') ||
                (key === 'expired')) {
                return parseInt(x);
            } else {
                return x;
            }
        };

        var removeKeyPrefix = function(obj, keyPrefix) {
            if ((typeof obj !== 'object') || (obj === null)) {
                return obj;
            } else {
                var result = {};
                Object.keys(obj).forEach((k) => {
                    if (k.startsWith(keyPrefix)) {
                        result[k.slice(keyPrefix.length)] = obj[k];
                    } else {
                        result[k] = obj[k];
                    }
                });
                return result;
            }
        };

        that.registerUser = function(user) {
            var date = (new Date()).toLocaleDateString();
            return doLuaAsync('registerUser', [
                userMap, reputationMapPrefix + user
            ], [
                user, defaultUnits, 'joined', date, 'completed',
                0, 'disputed', 0, 'expired', 0
            ]);
        };

        that.registerApp = function(app, cost) {
            var user = json_rpc.splitName(app)[0];
            var args = [app, cost || defaultTimePerUnit, appPublishCost, user];
            return doLuaAsync('registerApp',
                              [appsSetPrefix + user, appMap, userMap], args);
        };

        that.registerCA = function(ca) {
            var splitCA = json_rpc.splitName(ca, json_rpc.APP_SEPARATOR);
            var appWriter = json_rpc.splitName(splitCA[0])[0];
            var user = json_rpc.splitName(splitCA[1])[0];
            var app = splitCA[0];
            var time = (new Date()).getTime()/(24*60*60*1000.0);

            return doLuaAsync('registerCA', [
                userMap, appMap, casMap, casSetPrefix + user
            ], [appWriter, user, ca, appWriterFraction, time, app]);
        };

        that.checkCA = function(ca) {
            var time = (new Date()).getTime()/(24*60*60*1000.0);
            return doLuaAsync('checkCA', [casMap], [ca, time]);
        };

        that.addUnits = function(nonce, user, units) {
            return doLuaAsync('addUnits', [nonceMap, userMap],
                              [nonce, user, units]);
        };

        that.removeUnits = function(nonce, user, units) {
            return doLuaAsync('removeUnits', [nonceMap, userMap],
                              [nonce, user, units]);
        };

        that.changeUnits = function(nonce, user, units) {
            return (units < 0 ? that.removeUnits(nonce, user, -units) :
                    that.addUnits(nonce, user, units));
        };

        that.listUsers = function() {
            return doLuaAsync('listUsers', [userMap], []);
        };

        that.listApps = function(user) {
            return doLuaAsync('listApps',
                              [appsSetPrefix + user, appMap], []);
        };

        that.listCAs = function(user) {
            return doLuaAsync('listCAs',
                              [casSetPrefix + user, casMap], []);
        };

        that.listOffers = function(user) {
            return doLuaAsync('listOffers',
                              [offersSetPrefix + user], []);
        };

        that.listAccepts = function(user) {
            return doLuaAsync('listAccepts',
                              [acceptsSetPrefix + user], []);
        };

        that.describeUser = function(user) {
            return doLuaAsync('describeUser', [userMap], [user]);
        };

        that.describeReputation = function(user) {
            return doLuaAsync('describeReputation',
                              [reputationMapPrefix + user], []);
        };

        that.describeReputationExternal = function(user) {
            return new Promise(async function (resolve, reject) {
                try {
                    resolve(arrayToObject(await that.describeReputation(user),
                                          (x, k) => decodeReputationValues(x, k)
                                         )
                           );
                } catch (err) {
                    reject(err);
                }
            });
        };

        that.describeApp = function(app) {
            return doLuaAsync('describeApp', [appMap], [app]);
        };

        that.describeCA = function(ca) {
            return doLuaAsync('describeCA', [casMap], [ca]);
        };

        that.describeTransfer = function(id) {
            return doLuaAsync('describeTransfer', [transferPrefix + id], []);
        };

        that.transferUnits = function(nonce, from, to, units, id) {
            var expires = defaultHoldTimeInSec * 1000 + (new Date()).getTime();
            return doLuaAsync('transferUnits', [
                nonceMap,
                userMap,
                offersSetPrefix + from,
                acceptsSetPrefix + to,
                transferPrefix + id
            ], [nonce, from, to, units, expires]);
        };

        that.releaseTransfer = function(from, id) {
            return doLuaAsync('releaseTransfer', [
                offersSetPrefix + from,
                transferPrefix + id
            ], [from]);
        };

        that.expireTransfer = function(from, to, units, id) {
            var now = (new Date()).getTime();
            return doLuaAsync('expireTransfer', [
                userMap,
                offersSetPrefix + from,
                acceptsSetPrefix + to,
                transferPrefix + id,
                reputationMapPrefix + from,
                reputationMapPrefix + to
            ], [from, units, now]);
        };

        that.acceptTransfer = function(from, to, units, id) {
            return doLuaAsync('acceptTransfer', [
                userMap,
                offersSetPrefix + from,
                acceptsSetPrefix + to,
                transferPrefix + id,
                reputationMapPrefix + from,
                reputationMapPrefix + to
            ], [to, units]);
        };

        that.disputeTransfer = function(from, to, units, id) {
            return doLuaAsync('disputeTransfer', [
                userMap,
                offersSetPrefix + from,
                acceptsSetPrefix + to,
                transferPrefix + id,
                reputationMapPrefix + from,
                reputationMapPrefix + to
            ], [from, units, to]);
        };

        that.getUserInfo = async function(user) {
            try {
                var userInfo = parseFloat(await that.describeUser(user));
                var apps = arrayToObject(await that.listApps(user),
                                         x => parseFloat(x));
                var cas = arrayToObject(await that.listCAs(user),
                                        x => parseFloat(x));
                var offers = arrayToObject(await that.listOffers(user),
                                           x => decodeTransferValues(x));
                offers = removeKeyPrefix(offers, transferPrefix);
                var accepts = arrayToObject(await that.listAccepts(user),
                                            x => decodeTransferValues(x));
                accepts = removeKeyPrefix(accepts, transferPrefix);

                var reputation =
                        arrayToObject(await that.describeReputation(user),
                                      (x, k) => decodeReputationValues(x, k));

                return [null, {
                    user: userInfo, apps: apps, cas: cas, offers: offers,
                    accepts: accepts, reputation: reputation
                }];
            } catch (err) {
                return [err];
            }
        };

        var dynamicServiceConfig = $._.$.paas &&
            $._.$.paas.getServiceConfig(spec.env.paas) || null;
        await initClientAsync(dynamicServiceConfig, luaAll, null);

        $._.$.log && $._.$.log.debug('Pre-registering users: ' +
                                     JSON.stringify(preRegisterUsers));
        preRegisterUsers.forEach(async function(user) {
            if (user) {
                await that.registerUser(user);
            }
        });

        for (var i=0; i<Math.floor(preRegisterApp.length/2); i++) {
            if (preRegisterApp[2*i] && preRegisterApp[2*i+1]) {
                var preApp = json_rpc.joinName(preRegisterApp[2*i],
                                               preRegisterApp[2*i+1]);
                $._.$.log && $._.$.log.debug('Pre-registering app: ' + preApp);
                that.registerApp(preApp);
            }
        }

        return [null, that];
    } catch (err) {
        return [err];
    }
};

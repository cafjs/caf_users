/*!
Copyright 2020 Caf.js Labs and contributors

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

'use strict';
/**
 * A plug to access a user management backend based on Redis.
 *
 *  Properties:
 *
 *       {reloadUsersIntervalInSec: number, defaultUnits: number,
 *        defaultTimePerUnit: number, defaultHoldTimeInSec: number,
 *        appWriterFraction: number, appPublishCost: number,
 *        accountsApp: string,
 *        preRegisterUsers: Array.<string>=, preRegisterApp: Array.<string>=}
 *
 *  where:
 *
 *  * `reloadUsersIntervalInSec`:  seconds between stats reloads.
 *  * `defaultUnits`:  number of units granted to a new account.
 *  * `defaultTimePerUnit`:  number of days per unit.
 *  * `defaultHoldTimeInSec`: #seconds an offered unit is in an escrow account.
 *  * `appWriterFraction`:  fraction of a unit given to the app writer for
 *  each new registered CA in that app.
 *  * `accountsApp`: The name of the accounts app, e.g., `root-accounts`.
 *  * `appPublishCost`:  number of units needed to register a new app.
 *  * `preRegisterUsers`:  default users that need to be registered (optional).
 *  * `preRegisterApp`:  default apps that need to be registered (optional).
 *
 * @module caf_users/plug_users
 * @augments module:caf_redis/gen_redis_plug
 */
// @ts-ignore: augments not attached to a class

const assert = require('assert');
const util = require('util');
const genRedisPlug = require('caf_redis').gen_redis_plug;
const json_rpc = require('caf_transport').json_rpc;
const caf_comp = require('caf_components');
const myUtils = caf_comp.myUtils;
const genCron = caf_comp.gen_cron;
const luaAll = require('./plug_users_lua').luaAll;

const USER_PREFIX = 'user:';
const USER_MAP = USER_PREFIX + 'users';
const APP_MAP = USER_PREFIX + 'apps';
const CAS_MAP = USER_PREFIX + 'cas';
const NONCE_MAP = USER_PREFIX + 'nonces';
const STATS_MAP = USER_PREFIX + 'stats';
const UNITS_STREAM = USER_PREFIX + 'units';

const REPUTATION_MAP_PREFIX = USER_PREFIX + 'reputationMap';
const APPS_SET_PREFIX = USER_PREFIX + 'appsSet';
const CAS_SET_PREFIX = USER_PREFIX + 'casSet';
const OFFERS_SET_PREFIX = USER_PREFIX + 'offersSet';
const ACCEPTS_SET_PREFIX = USER_PREFIX + 'acceptsSet';
const APP_STATS_LIST_PREFIX = USER_PREFIX + 'appStatsList';

const TRANSFER_PREFIX = 'transfer:transfer';

// See `plug_users_lua` for a description of the main Redis datastructures.
exports.newInstance = async function($, spec) {
    try {
        $._.$.log && $._.$.log.debug('New Users plug');

        assert.equal(typeof spec.env.reloadUsersIntervalInSec, 'number',
                     "'spec.env.reloadUsersIntervalInSec' is not a number");
        const cronSpec = {
            name: spec.name + '_cron__',
            module: 'gen_cron', // module ignored
            env: {interval: spec.env.reloadUsersIntervalInSec *1000}
        };
        const updateCron = genCron.create(null, cronSpec);


        const that = genRedisPlug.create($, spec);

        // appName -> Array.<{appName: str, timestamp: number, count: number}>
        let appStats = {};

        const appName = ($._.__ca_getAppName__ && $._.__ca_getAppName__()) ||
                spec.env.appName;

        assert.equal(typeof(appName), 'string',
                     "'appName' is not a string");

        const userMap = json_rpc.joinName(USER_MAP, appName);
        const appMap = json_rpc.joinName(APP_MAP, appName);
        const casMap = json_rpc.joinName(CAS_MAP, appName);
        const nonceMap = json_rpc.joinName(NONCE_MAP, appName);
        const unitsStream = json_rpc.joinName(UNITS_STREAM, appName);
        const statsMap = json_rpc.joinName(STATS_MAP, appName);

        const appsSetPrefix = json_rpc.joinName(APPS_SET_PREFIX, appName) + ':';
        const appStatsListPrefix = json_rpc.joinName(APP_STATS_LIST_PREFIX,
                                                     appName) + ':';
        const casSetPrefix = json_rpc.joinName(CAS_SET_PREFIX, appName) + ':';
        const offersSetPrefix = json_rpc.joinName(OFFERS_SET_PREFIX, appName) +
                ':';
        const acceptsSetPrefix = json_rpc.joinName(ACCEPTS_SET_PREFIX,
                                                   appName) + ':';
        const reputationMapPrefix = json_rpc.joinName(REPUTATION_MAP_PREFIX,
                                                      appName) + ':';

        const transferPrefix = json_rpc.joinName(TRANSFER_PREFIX, appName) +
                  ':';

        assert.equal(typeof(spec.env.accountsApp), 'string',
                     "'spec.env.accountsApp' is not a string");

        assert.equal(typeof(spec.env.defaultUnits), 'number',
                     "'spec.env.defaultUnits' is not a number");
        const defaultUnits = spec.env.defaultUnits;

        assert.equal(typeof(spec.env.defaultTimePerUnit), 'number',
                     "'spec.env.defaultTimePerUnit' is not a number");
        const defaultTimePerUnit = spec.env.defaultTimePerUnit;

        assert.equal(typeof(spec.env.defaultHoldTimeInSec), 'number',
                     "'spec.env.defaultHoldTimeInSec' is not a number");
        const defaultHoldTimeInSec = spec.env.defaultHoldTimeInSec;

        assert.equal(typeof(spec.env.appWriterFraction), 'number',
                     "'spec.env.appWriterFraction' is not a number");
        const appWriterFraction = spec.env.appWriterFraction;

        assert.equal(typeof(spec.env.appPublishCost), 'number',
                     "'spec.env.appPublishCost' is not a number");
        const appPublishCost = spec.env.appPublishCost;

        let preRegisterUsers = [];
        if (spec.env.preRegisterUsers) {
            assert(Array.isArray(spec.env.preRegisterUsers),
                   "'spec.env.preRegisterUsers' is not an array of strings");
            preRegisterUsers = spec.env.preRegisterUsers;
        }

        let preRegisterApp = [];
        if (spec.env.preRegisterApp) {
            assert(Array.isArray(spec.env.preRegisterApp),
                   "'spec.env.preRegisterApp' is not an array of strings");
            preRegisterApp = spec.env.preRegisterApp;
        }


        const doLuaAsync = util.promisify(that.__ca_doLuaOp__);
        const initClientAsync = util.promisify(that.__ca_initClient__);

        const arrayToObject = function(arr, f) {
            const res = {};
            let key = null;
            for (let i=0; i<arr.length; i++) {
                if (i%2 === 0) {
                    key = arr[i];
                } else {
                    res[key] = f(arr[i], key);
                }
            }
            return res;
        };

        const decodeTransferValues = function(x) {
            const result = JSON.parse(x);
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

        const decodeAppStats = function(x) {
            const result = JSON.parse(x);
            if (Array.isArray(result)) {
                return result.map((recStr) => JSON.parse(recStr));
            } else {
                // cjson.encode maps an empty array to an empty object.
                return [];
            }
        };

        const decodeReputationValues = function(x, key) {
            if ((key === 'completed') || (key === 'disputed') ||
                (key === 'expired')) {
                return parseInt(x);
            } else {
                return x;
            }
        };

        const removeKeyPrefix = function(obj, keyPrefix) {
            if ((typeof obj !== 'object') || (obj === null)) {
                return obj;
            } else {
                const result = {};
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
            const date = (new Date()).toLocaleDateString();
            return doLuaAsync('registerUser', [
                userMap, reputationMapPrefix + user, statsMap, unitsStream
            ], [
                user, defaultUnits, 'joined', date, 'completed',
                0, 'disputed', 0, 'expired', 0
            ]);
        };

        that.registerApp = function(app, cost) {
            const user = json_rpc.splitName(app)[0];
            const args = [app, cost || defaultTimePerUnit, appPublishCost,
                          user];
            return doLuaAsync('registerApp',
                              [appsSetPrefix + user, appMap, userMap, statsMap,
                               unitsStream], args);
        };

        that.registerCA = function(ca) {
            const splitCA = json_rpc.splitName(ca, json_rpc.APP_SEPARATOR);
            const appWriter = json_rpc.splitName(splitCA[0])[0];
            const user = json_rpc.splitName(splitCA[1])[0];
            const app = splitCA[0];
            const time = (new Date()).getTime()/(24*60*60*1000.0);

            return doLuaAsync('registerCA', [
                userMap, appMap, casMap, casSetPrefix + user, statsMap,
                unitsStream
            ], [appWriter, user, ca, appWriterFraction, time, app]);
        };

        that.unregisterCA = function(ca) {
            const splitCA = json_rpc.splitName(ca, json_rpc.APP_SEPARATOR);
            const user = json_rpc.splitName(splitCA[1])[0];

            return doLuaAsync('unregisterCA', [casMap, casSetPrefix + user],
                              [ca]);
        };

        that.checkCA = function(ca) {
            const time = (new Date()).getTime()/(24*60*60*1000.0);
            return doLuaAsync('checkCA', [casMap], [ca, time]);
        };

        that.addUnits = (nonce, user, units) =>
            doLuaAsync('addUnits', [nonceMap, userMap, statsMap, unitsStream],
                       [nonce, user, units]);

        that.updateApp = (myAppName, timePerUnit) =>
            doLuaAsync('updateApp', [appMap], [myAppName, timePerUnit]);

        that.removeUnits = (nonc, user, units) =>
            doLuaAsync('removeUnits', [nonceMap, userMap, statsMap,
                                       unitsStream], [nonc, user, units]);

        that.changeUnits = (nonce, user, units) =>
            units < 0 ?
                that.removeUnits(nonce, user, -units) :
                that.addUnits(nonce, user, units);

        that.listUsers = () => doLuaAsync('listUsers', [userMap], []);

        that.listAllApps = () => doLuaAsync('listAllApps', [appMap], []);

        that.listApps = (user) =>
            doLuaAsync('listApps', [appsSetPrefix + user, appMap], []);

        that.listCAs = (user) =>
            doLuaAsync('listCAs', [casSetPrefix + user, casMap], []);

        that.listOffers = (user) =>
            doLuaAsync('listOffers', [offersSetPrefix + user], []);

        that.listAppStats = () =>
            doLuaAsync('listAppStats', [appMap], [appStatsListPrefix]);

        that.listAccepts = (user) =>
            doLuaAsync('listAccepts', [acceptsSetPrefix + user], []);

        that.describeAllCAs = () =>
            doLuaAsync('describeAllCAs', [casMap], []);

        that.describeUser = (user) =>
            doLuaAsync('describeUser', [userMap], [user]);

        that.describeReputation = (user) =>
            doLuaAsync('describeReputation', [reputationMapPrefix + user], []);

        that.describeReputationExternal = async (user) =>
            arrayToObject(
                await that.describeReputation(user), decodeReputationValues
            );

        that.describeApp = (app) =>
            doLuaAsync('describeApp', [appMap], [app]);

        that.describeCA = (ca) =>
            doLuaAsync('describeCA', [casMap], [ca]);

        that.describeTransfer = (id) =>
            doLuaAsync('describeTransfer', [transferPrefix + id], []);

        that.describeAllocated = async () => {
            const alloc = await doLuaAsync('describeAllocated', [statsMap], []);
            return parseFloat(alloc);
        };

        that.transferUnits = function(nonce, from, to, units, id) {
            const expires = defaultHoldTimeInSec * 1000 +
                      (new Date()).getTime();
            return doLuaAsync('transferUnits', [
                nonceMap,
                userMap,
                offersSetPrefix + from,
                acceptsSetPrefix + to,
                transferPrefix + id,
                statsMap,
                unitsStream
            ], [nonce, from, to, units, expires]);
        };

        that.releaseTransfer = (from, id) =>
            doLuaAsync('releaseTransfer', [
                offersSetPrefix + from,
                transferPrefix + id
            ], [from]);

        that.expireTransfer = (from, to, units, id) =>
            doLuaAsync('expireTransfer', [
                userMap,
                offersSetPrefix + from,
                acceptsSetPrefix + to,
                transferPrefix + id,
                reputationMapPrefix + from,
                reputationMapPrefix + to,
                statsMap,
                unitsStream
            ], [from, units, (new Date()).getTime()]);

        that.acceptTransfer = (from, to, units, id) =>
            doLuaAsync('acceptTransfer', [
                userMap,
                offersSetPrefix + from,
                acceptsSetPrefix + to,
                transferPrefix + id,
                reputationMapPrefix + from,
                reputationMapPrefix + to,
                statsMap,
                unitsStream
            ], [to, units]);

        that.disputeTransfer = (from, to, units, id) =>
            doLuaAsync('disputeTransfer', [
                userMap,
                offersSetPrefix + from,
                acceptsSetPrefix + to,
                transferPrefix + id,
                reputationMapPrefix + from,
                reputationMapPrefix + to,
                statsMap,
                unitsStream
            ], [from, units, to]);

        that.appendToAppStats = async (myAppName, stats) =>
            doLuaAsync('appendToAppStats',
                       [appMap, appStatsListPrefix + myAppName],
                       [myAppName, stats]);

        that.computeAppUsage = async function() {
            try {
                /* This will slowdown everybody for > 1M CAs.
                 * TODO: use hscan to incrementally update the stats
                 */
                const allCAs = arrayToObject(await that.describeAllCAs(),
                                             x => parseFloat(x));
                const now = (new Date()).getTime();
                const nowInDays = now/(24*60*60*1000);
                const counters = {};

                for (const [ca, t] of Object.entries(allCAs)) {
                    if (t > nowInDays) {
                        const myAppName = json_rpc.splitName(
                            ca, json_rpc.APP_SEPARATOR
                        )[0];
                        let count = counters[myAppName] || 0;
                        count = count + 1;
                        counters[myAppName] = count;
                    }
                }

                /* slow for > 10K apps, but it does not block everybody else.
                 * TODO: group in batches of 10 or more.
                 */
                for (const [myAppName, count] of Object.entries(counters)) {
                    const rec = {timestamp: now, count: count,
                                 appName: myAppName};
                    await that.appendToAppStats(myAppName, JSON.stringify(rec));
                }

                await that.reloadAppStats();
            } catch (err) {
                // caller does not wait, just log the error
                $._.$.log && $._.$.log.warn('Cannot compute app stats: '
                                            + myUtils.errToPrettyStr(err));
            }
        };

        that.reloadAppStats = async function() {
            $._.$.log && $._.$.log.debug('Reloading app stats');
            appStats = arrayToObject(await that.listAppStats(), decodeAppStats);
        };

        that.getAppUsage = (app) => appStats[app];

        that.getUserInfo = async function(user) {
            try {
                const userInfo = parseFloat(await that.describeUser(user));
                const apps = arrayToObject(await that.listApps(user),
                                           x => parseFloat(x));
                const cas = arrayToObject(await that.listCAs(user),
                                          x => parseFloat(x));
                let offers = arrayToObject(await that.listOffers(user),
                                           decodeTransferValues);
                offers = removeKeyPrefix(offers, transferPrefix);
                let accepts = arrayToObject(await that.listAccepts(user),
                                            decodeTransferValues);
                accepts = removeKeyPrefix(accepts, transferPrefix);

                const reputation =
                        arrayToObject(await that.describeReputation(user),
                                      decodeReputationValues);

                return [null, {
                    user: userInfo, apps: apps, cas: cas, offers: offers,
                    accepts: accepts, reputation: reputation
                }];
            } catch (err) {
                return [err];
            }
        };

        that.confirmOrder = async function(tokenStr, order) {
            try {
                const {id, tid, units, value, user} = order;
                const balance = parseFloat(await that.describeUser(user));
                const from = json_rpc.accountFrom(user);
                const fqn = json_rpc.joinNameArray([spec.env.accountsApp, from],
                                                   json_rpc.APP_SEPARATOR);

                return await $._.$.crossapp.call(
                    fqn, null, 'confirmOrder',
                    // No retry
                    [tokenStr, {id, tid, units, value, balance}], null, 0
                );
            } catch (err) {
                return [err];
            }
        };

        const super__ca_shutdown__ = myUtils.superior(that, '__ca_shutdown__');
        that.__ca_shutdown__ = function(data, cb) {
            updateCron && updateCron.__ca_stop__();
            super__ca_shutdown__(data, cb);
        };

        const dynamicServiceConfig = $._.$.paas &&
            $._.$.paas.getServiceConfig(spec.env.paas) || null;
        await initClientAsync(dynamicServiceConfig, luaAll, null);

        $._.$.log && $._.$.log.debug('Pre-registering users: ' +
                                     JSON.stringify(preRegisterUsers));
        preRegisterUsers.forEach(async function(user) {
            if (user) {
                await that.registerUser(user);
            }
        });

        for (let i=0; i<Math.floor(preRegisterApp.length/2); i++) {
            if (preRegisterApp[2*i] && preRegisterApp[2*i+1]) {
                const preApp = json_rpc.joinName(preRegisterApp[2*i],
                                                 preRegisterApp[2*i+1]);
                $._.$.log && $._.$.log.debug('Pre-registering app: ' + preApp);
                await that.registerApp(preApp);
            }
        }

        await that.reloadAppStats();
        updateCron.__ca_start__(that.reloadAppStats);

        return [null, that];
    } catch (err) {
        return [err];
    }
};

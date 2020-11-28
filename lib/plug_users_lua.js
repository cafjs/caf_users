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

/*                       Main Datastructures:
 *    GLOBAL:
 *        user:apps-root-people  (MAP)
 *             -Keys are full app names, values are days per unit
 *
 *        user:appsRegister-root-people  (MAP)
 *             -Keys are full app names, values are  expire time (number) in
 *         days since 1970 (i.e., getTime()) for the app registration
 *
 *        user:appsPlans-root-people  (MAP)
 *             -Keys are full app names, values are the plan chosen for the app
 *
 *        user:appsProfit-root-people  (MAP)
 *             -Keys are full app names, values are the ratio of the final
 *         price that the programmers get.
 *
 *        user:users-root-people (MAP)
 *             -Keys usernames, values are number of units left
 *
 *        user:cas-root-people (MAP)
 *             -Keys full CA names (e.g., root-gadget#foo-xx), values
 *        are expire time (number) in days since 1970 (i.e., getTime())
 *
 *        user:stats-root-people (MAP)
 *             -keys  'allocated'
 *              types  'float'
 *
 *        user:units-root-people (STREAM)
 *             -Log to track unit allocation over time with records of the form:
 *                {user: string, old: number, new: number, reason: string=}
 *               (note that by adding 'old' we can make xadd idempotent by
 *                filtering duplicates)
 *
 *    PER USER (let's call it `foo`):
 *        user:reputationMap-root-people:foo (MAP)
 *             -keys are `joined`, `completed`, `disputed` and `expired`
 *              values are `date`,   number,        number,  and   number
 *
 *        user:appsSet-root-people:foo (SET)
 *             -entries are full names of apps registered by this user
 *
 *        user:casSet-root-people:foo (SET)
 *             -entries are full names of CAs owned by this user
 *
 *    PER APP (let's call it `foo-myapp`):
 *        user:appStatsList-root-people:foo-myapp (LIST)
 *             -entries are strings (JSON serialized) with a record of the
 *              form {"timestamp" : number, "count": number}
 *               where 'timestamp' is in msec since 1970 (Date.getTime())
 *               and 'count' is number of CAs active at that time.
*/

// Formating of fixed point float not working as expected...
// old = string.format("%.3g", math.floor(old*1000+ 0.5)/1000) \
// new = string.format("%.3g", math.floor(new*1000+ 0.5)/1000) \

/*eslint-disable */
const PREAMBLE =
'local function incUnits(users, stats, units, user, inc, reason) \
   local old = redis.call("hget", users, user) \
   if (old == false) then \
       old = 0 \
   end \
   local new = tonumber(old) + tonumber(inc) \
   redis.call("hincrbyfloat", users, user, inc) \
   redis.call("hincrbyfloat", stats, "allocated", inc) \
   redis.call("xadd", units, "*", "user", user, "old", old, "new", new, \
"reason", reason) \
 end \
 ';
/*eslint-enable*/

/*
 * Registers a new user with default units. Does nothing if user already exists.
 *
 * KEYS[1] users map name
 * KEYS[2] users reputation map name
 * KEYS[3] stats map
 * KEYS[4] units stream
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
const luaRegisterUser = PREAMBLE +
'if redis.call("hexists", KEYS[1], ARGV[1]) == 0 then \
   incUnits(KEYS[1], KEYS[3], KEYS[4], ARGV[1], ARGV[2], "newUser") \
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
 * Updates an existing app. It returns an error if it does not exist.
 *
 * KEYS[1] app map name
 * ARGV[1] app name
 * ARGV[2] updated time in days per cost unit
 *
 */
/*eslint-disable */
const luaUpdateApp =
'if redis.call("hexists", KEYS[1], ARGV[1]) == 0 then \
    return { err = "Updated app does not exist."} \
 else \
    local last = redis.call("hget", KEYS[1], ARGV[1]) \
    redis.call("hset", KEYS[1], ARGV[1], ARGV[2]) \
    return last \
 end \
';
/*eslint-enable*/

/*
 * Appends stats for an existing app. It returns an error if it does not exist.
 *
 * KEYS[1] app map name
 * KEYS[2] stats queue for the app
 * ARGV[1] app name
 * ARGV[2] app stats
 *
 */
/*eslint-disable */
const luaAppendToAppStats =
'if redis.call("hexists", KEYS[1], ARGV[1]) == 0 then \
    return { err = "Appending stats for an app that does not exist."} \
 else \
    redis.call("rpush", KEYS[2], ARGV[2]) \
 end \
';
/*eslint-enable*/


/*
 * Registers a new app. If app already exists we assume that is just an update
 * of the plan, profit and cost in days/unit.
 *
 * KEYS[1] apps set for this user
 * KEYS[2] app map name
 * KEYS[3] user map name
 * KEYS[4] stats map name
 * KEYS[5] units stream name
 * KEYS[6] appRegister map name
 * KEYS[7] appPlansMap map name
 * KEYS[8] appProfitMap map name
 * ARGV[1] app name
 * ARGV[2] days per cost unit
 * ARGV[3] cost in units for publishing app
 * ARGV[4] the app publisher
 * ARGV[5] registration expire time in days since 1970
 * ARGV[6] plan chosen
 * ARGV[7] profit for the programmer
 *
 */
/*eslint-disable */
const luaRegisterApp = PREAMBLE +
'if redis.call("hexists", KEYS[2], ARGV[1]) == 0 then \
   local cost = tonumber(ARGV[3]) \
   local ownerBalance = redis.call("hget", KEYS[3], ARGV[4]) \
   ownerBalance = tonumber(ownerBalance) \
   if not ownerBalance or (ownerBalance < cost) then \
     return { err = "User does not have enough balance."} \
   else \
     incUnits(KEYS[3], KEYS[4], KEYS[5], ARGV[4], "-" .. ARGV[3], "newApp") \
     redis.call("sadd", KEYS[1], ARGV[1]) \
     redis.call("hset", KEYS[2], ARGV[1], ARGV[2]) \
     redis.call("hset", KEYS[6], ARGV[1], ARGV[5]) \
     redis.call("hset", KEYS[7], ARGV[1], ARGV[6]) \
     redis.call("hset", KEYS[8], ARGV[1], ARGV[7]) \
   end \
 else \
   redis.call("hset", KEYS[2], ARGV[1], ARGV[2]) \
   redis.call("hset", KEYS[7], ARGV[1], ARGV[6]) \
   redis.call("hset", KEYS[8], ARGV[1], ARGV[7]) \
 end ';
/*eslint-enable*/

/*
 * Unregisters an app. Does nothing if it is already unregisted.
 *
 *
 * KEYS[1] app map name
 * KEYS[2] apps set for this user
 * KEYS[3] stats queue for the app
 * KEYS[4] appRegister map name
 * KEYS[5] appPlansMap  map name
 * KEYS[6] appProfitMap map name
 * ARGV[1] app name
 *
 */
/*eslint-disable */
const luaUnregisterApp =
' redis.call("hdel", KEYS[1], ARGV[1]) \
  redis.call("hdel", KEYS[4], ARGV[1]) \
  redis.call("hdel", KEYS[5], ARGV[1]) \
  redis.call("hdel", KEYS[6], ARGV[1]) \
  redis.call("srem", KEYS[2], ARGV[1]) \
  return redis.call("del", KEYS[3]) ';

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
 * It also checks for app registration expiration and, if needed, deducts a unit
 * from the app writer balance and updates the app expiration date. Note that
 * we allow the balance to turn negative to avoid immediate app disruption,
 * relying on other mechanisms to limit abuse.
 *
 *
 * Missing app or not enough balance returns error.
 *
 * KEYS[1] user map name
 * KEYS[2] app map name
 * KEYS[3] CA map name
 * KEYS[4] CAs set for this user
 * KEYS[5] stats map name
 * KEYS[6] units stream name
 * KEYS[7] appRegister map name
 * KEYS[8] appProfit map name
 * ARGV[1] App writer name
 * ARGV[2] CA owner
 * ARGV[3] ca identifier
 * ARGV[4] units to add to app writer
 * ARGV[5] current time
 * ARGV[6] App name
 * ARGV[7] New app registration expire time in days since 1970
 *
 */
/*eslint-disable */
const luaRegisterCA = PREAMBLE +
'local expireTime = redis.call("hget", KEYS[3], ARGV[3]) \
if not expireTime or tonumber(expireTime) < tonumber(ARGV[5]) then \
 local extraTime = redis.call("hget", KEYS[2], ARGV[6]) \
 if not extraTime then \
     return { err = "App does not exist."} \
 else \
   local registrationExpireTime =  redis.call("hget", KEYS[7], ARGV[6]) \
   if not registrationExpireTime or \
      tonumber(registrationExpireTime) < tonumber(ARGV[5]) then \
      redis.call("hset", KEYS[7], ARGV[6], ARGV[7]) \
      incUnits(KEYS[1], KEYS[5], KEYS[6], ARGV[1], "-1.0", \
               "renewAppRegistration") \
   end \
   local ownerBalance = redis.call("hget", KEYS[1], ARGV[2]) \
   ownerBalance = tonumber(ownerBalance) \
   if not ownerBalance or (ownerBalance < 1) then \
     return { err = "User does not have enough balance."} \
   else \
     incUnits(KEYS[1], KEYS[5], KEYS[6], ARGV[2], "-1.0", "renewCA") \
     local profit = redis.call("hget", KEYS[8], ARGV[6]) \
     if (profit == false) then \
         profit = ARGV[4] \
     end \
     incUnits(KEYS[1], KEYS[5], KEYS[6], ARGV[1], profit, "renewCA") \
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
 * Unregisters a CA.
 *
 * KEYS[1] CA map name
 * KEYS[2] CAs set for this user
 * ARGV[1] ca identifier
 *
 */
/*eslint-disable */
const luaUnregisterCA =
' redis.call("hdel", KEYS[1], ARGV[1]) \
  return redis.call("srem", KEYS[2], ARGV[1]) ';
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
const luaCheckCA =
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
 * KEYS[3] stats map name
 * KEYS[4] units stream name
 * ARGV[1] nonce
 * ARGV[2] user
 * ARGV[3] extra units
 *
 */
/*eslint-disable */
const luaAddUnits = PREAMBLE +
'local nonce = redis.call("hget", KEYS[1], ARGV[2]) \
 if nonce ~= ARGV[1] then \
    redis.call("hset", KEYS[1], ARGV[2], ARGV[1]) \
    incUnits(KEYS[2], KEYS[3], KEYS[4], ARGV[2], ARGV[3], "addUnits") \
 end ';
/*eslint-enable*/

/*
 * Removes units from a user. If nonce is not fresh, it ignores request.
 *
 * If there are not enough units, it returns an error without changing the
 * balance.
 * KEYS[1] nonce name
 * KEYS[2] users map name
 * KEYS[3] stats map name
 * KEYS[4] units stream name
 * ARGV[1] nonce
 * ARGV[2] user
 * ARGV[3] units to remove
 *
 */
/*eslint-disable */
const luaRemoveUnits = PREAMBLE +
'local nonce = redis.call("hget", KEYS[1], ARGV[2]) \
 if nonce ~= ARGV[1] then \
    redis.call("hset", KEYS[1], ARGV[2], ARGV[1]) \
    local balance = redis.call("hget", KEYS[2], ARGV[2]) \
    if not balance then \
        return { err = "User does not exist."} \
    elseif tonumber(balance) < tonumber(ARGV[3]) then \
        return { err = "Not enough balance."} \
    else \
       incUnits(KEYS[2], KEYS[3], KEYS[4], ARGV[2], "-" .. ARGV[3], \
"removeUnits") \
    end \
 end ';
/*eslint-enable*/

/*
 * List users
 *
 * KEYS[1] users map name
 *
 */
const luaListUsers = 'return redis.call("hkeys", KEYS[1])';

/*
 * List apps for a user
 *
 * KEYS[1] name of user app set
 * KEYS[2] name of app map
 *
 */
const luaListApps = 'local all = redis.call("smembers", KEYS[1]) \
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
 * This script does not work in cluster mode due to dynamic keys.
 *
 * KEYS[1] name of user offers set
 *
 */
const luaListOffers = 'local all = redis.call("smembers", KEYS[1]) \
local result = {} \
for i =1, #all, 1 do \
  table.insert(result, all[i]) \
  table.insert(result,  cjson.encode(redis.call("hgetall", all[i]))) \
end \
return result';

/*
 * List stats for all apps. The values are JSON encoded strings
 * representing a list with strings of  JSON encoded
 * {"timestamp" : number, "count": number}.
 *
 * Note that cjson.encode maps an empty array to an empty object.
 *
 * This script does not work in cluster mode due to dynamic keys.
 *
 * KEYS[1] name of app map, i.e., user:apps-root-people
 * ARGV[1] prefix for app stats list, i.e., user:appStatsList-root-people:
 *
 */
const luaListAppStats = 'local all = redis.call("hkeys", KEYS[1]) \
local result = {} \
for i =1, #all, 1 do \
  table.insert(result, all[i]) \
  local listName = ARGV[1] .. all[i] \
  table.insert(result,  cjson.encode(redis.call("lrange", listName, 0, -1))) \
end \
return result';

/*
 * Describe #units allocated. Returns a string since it is a float
 *
 * KEYS[1] name of global stats map
 *
 */
const luaDescribeAllocated =
'return tostring(redis.call("hget", KEYS[1], "allocated"))';

/*
 * Describe a user
 *
 * KEYS[1] name of use map
 * ARGV[1] user
 *
 */
const luaDescribeUser = 'return redis.call("hget", KEYS[1], ARGV[1])';

/*
 * Describe the user's reputation
 *
 * KEYS[1] name of reputation map
 *
 */
const luaDescribeReputation = 'return redis.call("hgetall", KEYS[1])';

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
 * KEYS[6] stats map name
 * KEYS[7] units stream name
 *
 * ARGV[1] nonce to make operation idempotent
 * ARGV[2] FROM
 * ARGV[3] TO
 * ARGV[4] units
 * ARGV[5] expires
 */
const luaTransferUnits = PREAMBLE +
'local nonce = redis.call("hget", KEYS[1], ARGV[2]) \
 if nonce ~= ARGV[1] then \
   redis.call("hset", KEYS[1], ARGV[2], ARGV[1]) \
   local ownerBalance = redis.call("hget", KEYS[2], ARGV[2]) \
   ownerBalance = tonumber(ownerBalance) \
   local units = tonumber(ARGV[4]) \
   if not ownerBalance or (ownerBalance < units) then \
     return { err = "User does not have enough balance."} \
   else \
      incUnits(KEYS[2], KEYS[6], KEYS[7], ARGV[2], "-" .. ARGV[4], \
"transferUnits") \
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
const luaReleaseTransfer =
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
 * KEYS[7] stats map name
 * KEYS[8] units stream name
 *
 * ARGV[1] FROM
 * ARGV[2] units
 * ARGV[3] now
 */
const luaExpireTransfer = PREAMBLE +
'local from = redis.call("hget", KEYS[4], "from") \
 if from == ARGV[1] then \
    local expires = redis.call("hget", KEYS[4], "expires") \
    local now = tonumber(ARGV[3]) \
    expires = tonumber(expires) \
    if (now < expires) then \
       return { err = "Transfer has not expired yet."} \
    else \
       incUnits(KEYS[1], KEYS[7], KEYS[8], ARGV[1], ARGV[2], "expireTransfer") \
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
 * KEYS[7] stats map name
 * KEYS[8] units stream name
 *
 * ARGV[1] TO
 * ARGV[2] units
 */
const luaAcceptTransfer = PREAMBLE +
'local to = redis.call("hget", KEYS[4], "to") \
 if to == ARGV[1] then \
    local released = redis.call("hget", KEYS[4], "released") \
    if released == "true" then \
      incUnits(KEYS[1], KEYS[7], KEYS[8], ARGV[1], ARGV[2], "acceptTransfer") \
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
 * KEYS[7] stats map name
 * KEYS[8] units stream name
 *
 * ARGV[1] FROM
 * ARGV[2] units
 * ARGV[3] TO
 */
const luaDisputeTransfer = PREAMBLE +
'local to = redis.call("hget", KEYS[4], "to") \
 if to == ARGV[3] then \
    local released = redis.call("hget", KEYS[4], "released") \
    if released ~= "true" then \
      incUnits(KEYS[1], KEYS[7], KEYS[8], ARGV[1], ARGV[2], "disputeTransfer") \
      redis.call("srem", KEYS[2], KEYS[4]) \
      redis.call("srem", KEYS[3], KEYS[4]) \
      redis.call("hincrbyfloat", KEYS[5], "disputed", "1.0") \
      redis.call("hincrbyfloat", KEYS[6], "disputed", "1.0") \
      redis.call("del", KEYS[4]) \
    else \
      return { err = "Dispute after release."} \
    end \
 end ';

exports.luaAll = {
    registerUser: luaRegisterUser,
    registerApp: luaRegisterApp,
    unregisterApp: luaUnregisterApp,
    registerCA: luaRegisterCA,
    unregisterCA: luaUnregisterCA,
    updateApp: luaUpdateApp,
    appendToAppStats: luaAppendToAppStats,
    checkCA: luaCheckCA,
    addUnits: luaAddUnits,
    removeUnits: luaRemoveUnits,
    transferUnits: luaTransferUnits,
    releaseTransfer: luaReleaseTransfer,
    expireTransfer: luaExpireTransfer,
    acceptTransfer: luaAcceptTransfer,
    disputeTransfer: luaDisputeTransfer,
    listUsers: luaListUsers,
    listAllApps: luaListUsers, // same implementation, different key
    listApps: luaListApps,
    listAppsRegistration: luaListApps, // same implementation, different key
    listAppsPlans: luaListApps, // same implementation, different key
    listAppsProfit: luaListApps, // same implementation, different key
    listCAs: luaListApps, // same implementation, different key
    listOffers: luaListOffers,
    listAccepts: luaListOffers, // same implementation, different key
    listAppStats: luaListAppStats,
    describeReputation: luaDescribeReputation,
    describeTransfer: luaDescribeReputation, // same implem, different key
    describeAllCAs: luaDescribeReputation, // same implem, different key
    describeUser: luaDescribeUser,
    describeApp: luaDescribeUser, // same implementation, different key
    describeCA: luaDescribeUser, // same implementation, different key
    describeAllocated: luaDescribeAllocated
};

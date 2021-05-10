'use strict';

/**
 *  Proxy that allows a CA to manage a user profile.
 *
 * @module caf_users/proxy_users
 * @augments external:caf_components/gen_proxy
 */
// @ts-ignore: augments not attached to a class
const caf_comp = require('caf_components');
const genProxy = caf_comp.gen_proxy;

exports.newInstance = async function($, spec) {
    try {
        const that = genProxy.create($, spec);

        /**
         * Returns user info for the owner of this CA. This method is
         * asynchronous, returning the value by calling the method set by
         * `setHandleReplyMethod`. The return data type is `userInfoType`.
         *
         * @param  {string=} user The user to lookup. If the user is not the
         * CA owner it has to be privileged, i.e., `root`. Defaults to the CA
         * owner.
         *
         * @return {string} A unique identifier to match
         * replies for this request.
         *
         * @throws Error if the caller is not `root` and user is not the CA
         * owner.
         *
         * @memberof! module:caf_users/proxy_users#
         * @alias getUserInfo
         */
        that.getUserInfo = function(user) {
            return $._.getUserInfo(user);
        };

        /**
         * Attempts to register the user that owns this CA.
         *
         *
         * @return {string} A unique identifier to match
         * replies for this request.
         *
         * @memberof! module:caf_users/proxy_users#
         * @alias registerUser
         *
         */
        that.registerUser = function() {
            return $._.registerUser();
        };

        /**
         * Attempts to register a CA.
         *
         * @param {string} tokenStr A serialized token for the CA. The owner
         * of the CA in the token, and this CA's owner, should match.
         *
         * @return {string} A unique identifier to match
         * replies for this request.
         *
         * @throws {Error} If token cannot be validated.
         *
         * @memberof! module:caf_users/proxy_users#
         * @alias registerCA
         *
         */
        that.registerCA = function(tokenStr) {
            return $._.registerCA(tokenStr);
        };

        /**
         * Attempts to register a CA outside a transaction.
         *
         * The caller can block until the request fails or succeeds. It is the
         * client's responsability to retry.
         *
         * @param {string} tokenStr A serialized token for the CA. The owner
         * of the CA in the token, and this CA's owner, should match.
         *
         * @return {Promise<number>} A promise to be resolved with the
         * remaining time in days for the CA, or rejected with an error
         * if we cannot register/renew the CA.
         *
         * @throws {Error} If token cannot be validated.
         * @memberof! module:caf_users/proxy_users#
         * @alias dirtyRegisterCA
         *
         */
        that.dirtyRegisterCA = function(tokenStr) {
            return $._.dirtyRegisterCA(tokenStr);
        };

        /**
         * Attempts to unregister a CA.
         *
         * @param {string} tokenStr A serialized token for the CA. The owner
         * of the CA in the token, and this CA's owner, should match.
         *
         * @return {string} A unique identifier to match
         * replies for this request.
         *
         * @throws {Error} If token cannot be validated.
         *
         * @memberof! module:caf_users/proxy_users#
         * @alias unregisterCA
         *
         */
        that.unregisterCA = function(tokenStr) {
            return $._.unregisterCA(tokenStr);
        };

        /**
         * Attempts to unregister a CA outside a transaction.
         *
         * The caller can block until the request fails or succeeds. It is the
         * client's responsability to retry.
         *
         * @param {string} tokenStr A serialized token for the CA. The owner
         * of the CA in the token, and this CA's owner, should match.
         *
         * @return {Promise<number>} A promise to be resolved with the number
         * of CAs unregistered, or rejected with an error if we cannot
         * perform the operation.
         *
         * @throws {Error} If token cannot be validated.
         * @memberof! module:caf_users/proxy_users#
         * @alias dirtyUnregisterCA
         *
         */
        that.dirtyUnregisterCA = function(tokenStr) {
            return $._.dirtyUnregisterCA(tokenStr);
        };

        /**
         * Attempts to check that a CA is still valid.
         *
         * The caller can block until the request fails or succeeds. It is the
         * client's responsability to retry.
         *
         * @param {string} fqn  A fully qualified name for the CA, e.g.,
         * `root-app#foo-xx'.
         *
         * @return {Promise<number>} A promise to be resolved with the number
         * `expireTime` that is the remaining time in days for the CA or
         * `-1` if it has already expired.
         *
         * @throws {Error} If `fqn` malformed or cannot check.
         *
         * @memberof! module:caf_users/proxy_users#
         * @alias dirtyCheckCA
         *
         */
        that.dirtyCheckCA = function(fqn) {
            return $._.dirtyCheckCA(fqn);
        };

        /**
         * Attempts to check that an app has been registered.
         *
         * The caller can block until the request fails or succeeds. It is the
         * client's responsability to retry.
         *
         * @param {string} app  An app name, e.g., `root-app'.
         *
         * @return {Promise<string>} A promise to be resolved with
         * a description of the app,  or `null` if not registered.
         *
         * @throws {Error} If `app` malformed or cannot check.
         *
         * @memberof! module:caf_users/proxy_users#
         * @alias dirtyCheckApp
         *
         */
        that.dirtyCheckApp = function(app) {
            return $._.dirtyCheckApp(app);
        };

        /**
         * Gets the cost of an app.
         *
         * The caller can block until the request fails or succeeds. It is the
         * client's responsability to retry.
         *
         * @param {string} app  An app name, e.g., `root-app'.
         *
         * @return {Promise<string>} A promise to be resolved with
         * the cost of the app in days per unit,  or `null` if not registered.
         *
         * @throws {Error} If `app` malformed or cannot check.
         *
         * @memberof! module:caf_users/proxy_users#
         * @alias dirtyGetAppCost
         *
         */
        that.dirtyGetAppCost = function(app) {
            // not a typo, `dirtyCheckApp` returns the cost
            return $._.dirtyCheckApp(app);
        };

        /**
         * Attempts to register an application.
         *
         * @param {string} tokenStr A serialized token for this app.
         * The token is for a "CA" of the form `<user>-<app>-<user>-<anything>`,
         * i.e., it authenticates the application owner.
         *
         * @param {string} plan One of 'platinum', 'gold', 'silver' or 'bronze',
         * setting a base line cost for each CA.
         * @param {number} profit A ratio from 0 to 0.9 representing the
         * programmers margin.
         *
         * @return {string} A unique identifier to match
         * replies for this request.
         *
         * @throws {Error} If token cannot be validated.
         *
         * @memberof! module:caf_users/proxy_users#
         * @alias registerApp
         *
         */
        that.registerApp = function(tokenStr, plan, profit) {
            return $._.registerApp(tokenStr, plan, profit);
        };

        /**
         * Attempts to unregister an application.
         *
         * @param {string} tokenStr A serialized token for this app.
         * The token is for a "CA" of the form `<user>-<app>-<user>-<anything>`,
         * i.e., it authenticates the application owner.
         *
         * @return {string} A unique identifier to match
         * replies for this request.
         *
         * @throws {Error} If token cannot be validated.
         *
         * @memberof! module:caf_users/proxy_users#
         * @alias unregisterApp
         *
         */
        that.unregisterApp = function(tokenStr) {
            return $._.unregisterApp(tokenStr);
        };

        /**
         * Lookup usage stats for an app.
         *
         * Only privileged users can read data from apps they do not own.
         *
         * The type `statsType` is `{appName: string, timestamp: number,
         *  count: number}`
         *
         * where:
         *
         * `timestamp` is the time the measure was taken in msec since 1970.
         * `count` is the number of active CAs at the time for that app.
         *
         * @param {string} appName The name of the app.         *
         *
         * @return {Array.<statsType>} Usage stats for that app.
         *
         * @throws {Error} If unprivileged and accessing other users apps data.
         *
         * @memberof! module:caf_users/proxy_users#
         * @alias getAppUsage
         *
         */
        that.getAppUsage = function(appName) {
            return $._.getAppUsage(appName);
        };

        /**
         * Initiates a transfer of units to another user (Created).
         *
         *    Created  ---> Released ---> Accepted
         *    | |             |
         *    | |-> Expired<--|
         *    |
         *    |----> Disputed
         *
         * @param {string} to A username that will receive the units.
         * @param {number} units The number of units transferred.
         *
         * @return {string} A unique identifier  to match
         * replies for this request or identify the transfer.
         *
         * @memberof! module:caf_users/proxy_users#
         * @alias transferUnits
         *
         */
        that.transferUnits = function(to, units) {
            return $._.transferUnits(to, units);
        };

        /**
         * Releases a transfer of units to another user (Released).
         *
         * Typically this happens after receiving payment.
         *
         *    Created  ---> Released ---> Accepted
         *    | |             |
         *    | |-> Expired<--|
         *    |
         *    |----> Disputed
         *
         * @param {string} id A unique identifier for the transfer.
         *
         * @return {string}  A unique identifier to match
         * replies for this request.
         *
         * @memberof! module:caf_users/proxy_users#
         * @alias releaseTransfer
         *
         */
        that.releaseTransfer = function(id) {
            return $._.releaseTransfer(id);
        };

        /**
         * Expires a transfer of units to another user (Expired).
         *
         *  This method is typically called by `__ca_pulse__` and not
         * exposed in a remote API.
         *
         * It never forces early expiration, when invoked early it will return
         * an error in the handler method.
         *
         * After expiration the units are no longer on escrow and return to the
         * sender.
         *
         * Many expirations could also affect the reputation of users, e.g.,
         * a time waster, and it is recommended that a transfer is always
         * initiated after negotiation.
         *
         *    Created  ---> Released ---> Accepted
         *    | |             |
         *    | |-> Expired<--|
         *    |
         *    |----> Disputed
         *
         * @param {string} to A username that will receive the units.
         * @param {number} units The number of units transferred.
         * @param {string} id A unique identifier for the transfer.
         *
         * @return {string}  A unique identifier to match
         * replies for this request.
         *
         * @memberof! module:caf_users/proxy_users#
         * @alias expireTransfer
         *
         */
        that.expireTransfer = function(to, units, id) {
            return $._.expireTransfer(to, units, id);
        };

        /**
         * Accepts a transfer of units from another user (Accepted).
         *
         *
         *    Created  ---> Released ---> Accepted
         *    | |             |
         *    | |-> Expired<--|
         *    |
         *    |----> Disputed
         *
         * @param {string} from A username that sent the units.
         * @param {number} units The number of units transferred.
         * @param {string} id A unique identifier for the transfer.
         *
         * @return {string}  A unique identifier to match
         * replies for this request.
         *
         * @memberof! module:caf_users/proxy_users#
         * @alias acceptTransfer
         *
         */
        that.acceptTransfer = function(from, units, id) {
            return $._.acceptTransfer(from, units, id);
        };

        /**
         * Disputes a transfer of units from another user (Disputed).
         *
         * A possible reason is that a payment was made but the sender did not
         * release the transfer.
         *
         * It could affect negatively the reputation of
         * both parties, since it is not possible to verify the rogue one.
         * However, over a long period, the "good citizens" should have less
         * disputes if they are careful with whom they deal with.
         *
         * It should always be called ***before*** the transfer expires.
         *
         *    Created  ---> Released ---> Accepted
         *    | |             |
         *    | |-> Expired<--|
         *    |
         *    |----> Disputed
         *
         * @param {string} from A username that sent the units.
         * @param {number} units The number of units transferred.
         * @param {string} id A unique identifier for the transfer.
         *
         * @return {string}  A unique identifier to match
         * replies for this request.
         *
         * @memberof! module:caf_users/proxy_users#
         * @alias disputeTransfer
         *
         */
        that.disputeTransfer = function(from, units, id) {
            return $._.disputeTransfer(from, units, id);
        };

        /**
         * Gets the number of units currently allocated.
         *
         * This request is 'dirty', i.e., called outside the transaction.
         *
         * @return {Promise<number>}  A promise with the number of units
         * allocated.
         *
         * @memberof! module:caf_users/proxy_users#
         * @alias dirtyDescribeAllocated
         *
         */
        that.dirtyDescribeAllocated = function() {
            return $._.dirtyDescribeAllocated();
        };

        /**
         * Describes the contents of a pending transfer.
         *
         * This request is 'dirty', i.e., call outside the transaction. An
         *  alternative for transfers involving this CA is `getUserInfo()`
         *
         * See `types.js` for a description of the return type.
         *
         * @param {string} id A unique identifier for the transfer.
         *
         * @return {Promise<transferType>}  A description of the transfer or
         * rejected with an error transfer id is invalid or the transfer is
         * no longer pending.
         *
         * @memberof! module:caf_users/proxy_users#
         * @alias dirtyDescribeTransfer
         *
         */
        that.dirtyDescribeTransfer = function(id) {
            return $._.dirtyDescribeTransfer(id);
        };

        /**
         * Describes the reputation of a user.
         *
         * See `types.js` for a description of the return type.
         *
         * @param {string} username The name of the user to check.
         *
         * @return {Promise<reputationType>}  The reputation of an user or
         * rejected with an error if user missing.
         *
         * @memberof! module:caf_users/proxy_users#
         * @alias dirtyDescribeReputation
         *
         */
        that.dirtyDescribeReputation = function(username) {
            return $._.dirtyDescribeReputation(username);
        };

        /**
         * Sets the name of the method in this CA that will process
         * reply call messages.
         *
         * To ignore replies, just set it to `null`.
         *
         * The type of the method is `async function(requestId, response)`
         *
         * where:
         *
         *  *  `requestId`: is an unique identifier to match the request.
         * The original method name invoked is a prefix in this id.
         *  *  `response` is a tuple using the standard  `[Error, userInfoType]`
         * CAF.js convention.
         *
         * @param {string| null} methodName The name of this CA's method that
         *  process replies.
         *
         * @memberof! module:caf_users/proxy_users#
         * @alias setHandleReplyMethod
         *
         */
        that.setHandleReplyMethod = function(methodName) {
            $._.setHandleReplyMethod(methodName);
        };

        /**
         * Adds or substracts units to an arbitrary user.
         *
         * This method can only
         * be called by a privileged owner, i.e., `root`, when the user is
         * different from the owner.
         *
         *  This method is asynchronous, returning the value by calling the
         *  method set by `setHandleReplyMethod`. The return data type is
         * `number`, i.e., the current balance.
         *
         * @param {string} user The target user for the change.
         * @param {number} units The number of units to add or substract (when
         * negative) to the user balance.
         *
         * @return {string} A unique identifier to match
         * replies for this request.
         *
         * @throws Error if the caller is not `root` and the user is different.
         *
         * @memberof! module:caf_users/proxy_users#
         * @alias changeUnits
         */
        that.changeUnits = function(user, units) {
            return $._.changeUnits(user, units);
        };


        /**
         * Notifies the customer that the units order has been fullfilled.
         *
         * This is typically done by sending an e-mail.
         *
         *  This method is asynchronous, returning results or errors by calling
         * the method set by `setHandleReplyMethod`. The return data type is
         * `orderType=`, i.e., the original order.
         *
         * @param {string} tokenStr A serialized token from the `people` app
         * to auhorize the notification.
         * @param {orderType} order The order to notify about.
         *
         * @return {string} A unique identifier to match
         * replies for this request.
         *
         *
         * @memberof! module:caf_users/proxy_users#
         * @alias confirmOrder
         */
        that.confirmOrder = function(tokenStr, order) {
            return $._.confirmOrder(tokenStr, order);
        };

        /**
         * Registers a purchase of units.
         *
         * It depends on the `bank` plugin and also calls
         * `changeUnitsPrivileged`.
         *
         * This method can only
         * be called by a privileged owner, i.e., `root`, or it throws an error.
         *
         *  This method is asynchronous, returning the value by calling the
         *  method set by `setHandleReplyMethod`. The return data type is
         * `number`, i.e., the current balance.
         *
         * @param {string} user The target user for the purchase.
         * @param {number} units The number of units bought.
         *
         * @return {string} A unique identifier to match
         * replies for this request.
         *
         * @throws Error if the caller is not `root`.
         *
         * @memberof! module:caf_users/proxy_users#
         * @alias buyUnitsPrivileged
         */
        that.buyUnitsPrivileged = function(user, units) {
            return $._.buyUnitsPrivileged(user, units);
        };

        /**
         * Updates the cost in days per token of an app.
         *
         * This method can only
         * be called by a privileged owner, i.e., `root`, or it throws an error.
         *
         *  This method is asynchronous, returning the value by calling the
         *  method set by `setHandleReplyMethod`. The return data type is
         * `number`, i.e., the previous cost.
         *
         * @param {string} appName The full name of this app, e.g., `foo-myapp`.
         * @param {number} timePerUnit The number of days that a unit token
         * provides.
         *
         * @return {string} A unique identifier to match
         * replies for this request.
         *
         * @throws Error if the caller is not `root`.
         *
         * @memberof! module:caf_users/proxy_users#
         * @alias updateAppPrivileged
         */
        that.updateAppPrivileged = function(appName, timePerUnit) {
            return $._.updateAppPrivileged(appName, timePerUnit);
        };


        /**
         * Computes statistics for all registered apps.
         *
         * This operation is expensive, and it is typically called just once a
         * day by a privileged CA.
         *
         * New statistics are appended to a list, providing historical info of
         * the usage of an app.
         *
         * This method can only
         * be called by a privileged owner, i.e., `root`, or it throws an error.
         *
         * @throws Error if the caller is not `root`.
         *
         * @memberof! module:caf_users/proxy_users#
         * @alias computeAppUsagePrivileged
         */
        that.computeAppUsagePrivileged = function() {
            $._.computeAppUsagePrivileged();
        };

        /**
         * Lists all the registered users.
         *
         * This method can only
         * be called by a privileged owner, i.e., `root`, or it throws an error.
         *
         *  This method is asynchronous, returning the value by calling the
         *  method set by `setHandleReplyMethod`. The return data type is
         * `Array.<string>`.
         *
         *
         * @return {string} A unique identifier to match
         * replies for this request.
         *
         * @throws Error if the caller is not `root`.
         *
         * @memberof! module:caf_users/proxy_users#
         * @alias listUsersPrivileged
         */
        that.listUsersPrivileged = function() {
            return $._.listUsersPrivileged();
        };

        Object.freeze(that);

        return [null, that];
    } catch (err) {
        return [err];
    }
};

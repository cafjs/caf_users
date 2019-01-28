/*!
 Copyright 2013 Hewlett-Packard Development Company, L.P.

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
 *  Proxy that allows a CA to manage a user profile.
 *
 * @module caf_users/proxy_users
 * @augments external:caf_components/gen_proxy
 */
// @ts-ignore: augments not attached to a class
var caf_comp = require('caf_components');
var genProxy = caf_comp.gen_proxy;

exports.newInstance = async function($, spec) {
    try {
        var that = genProxy.constructor($, spec);

        /**
         * Returns user info for the owner of this CA. This method is
         * asynchronous, returning the value by calling the method set by
         * `setHandleReplyMethod`. The return data type is `userInfoType`.
         *
         *
         * @return {string} A unique identifier to match
         * replies for this request.
         *
         * @memberof! module:caf_users/proxy_users#
         * @alias getUserInfo
         */
        that.getUserInfo = function() {
            return $._.getUserInfo();
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
         * Attempts to register an application.
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
         * @alias registerApp
         *
         */
        that.registerApp = function(tokenStr) {
            return $._.registerApp(tokenStr);
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
         * Returns user info for an arbitrary user.
         *
         * This method can only be
         * called by a privileged owner, i.e., `root`, or it throws an error.
         *
         *  This method is asynchronous, returning the value by calling the
         *  method set by `setHandleReplyMethod`. The return data type is
         * `userInfoType`.
         *
         * @param  {string} user The user to lookup.
         *
         * @return {string} A unique identifier to match
         * replies for this request.
         *
         * @throws Error if the caller is not `root`.
         *
         * @memberof! module:caf_users/proxy_users#
         * @alias getUserInfoPrivileged
         */
        that.getUserInfoPrivileged = function(user) {
            return $._.getUserInfoPrivileged(user);
        };

        /**
         * Adds or substracts units to an arbitrary user.
         *
         * This method can only
         * be called by a privileged owner, i.e., `root`, or it throws an error.
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
         * @throws Error if the caller is not `root`.
         *
         * @memberof! module:caf_users/proxy_users#
         * @alias changeUnitsPrivileged
         */
        that.changeUnitsPrivileged = function(user, units) {
            return $._.changeUnitsPrivileged(user, units);
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

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
 * Manages user profiles for this CA.
 *
 *
 * @module caf_users/plug_ca_users
 * @augments external:caf_components/gen_plug_ca
 */
// @ts-ignore: augments not attached to a class
var assert = require('assert');
var caf_comp = require('caf_components');
var myUtils = caf_comp.myUtils;
var genPlugCA = caf_comp.gen_plug_ca;
var json_rpc = require('caf_transport').json_rpc;

exports.newInstance = async function($, spec) {
    try {
        var handleMethod = null;

        var that = genPlugCA.constructor($, spec);

        var owner = json_rpc.splitName($.ca.__ca_getName__())[0];

        var checkPrivileged = function() {
            if (owner !== 'root') {
                throw new Error('Not enough privileges to call this method');
            }
        };

        var handleReply = function(id, data) {
            if (handleMethod !== null) {
                /* Response processed in a separate transaction, i.e.,
                 using a fresh message */
                var m = json_rpc.systemRequest($.ca.__ca_getName__(),
                                               handleMethod, id, data);
                $.ca.__ca_process__(m, function(err) {
                    err && $.ca.$.log &&
                        $.ca.$.log.error('Got handler exception ' +
                                         myUtils.errToPrettyStr(err));
                });
            } else {
                var logMsg = 'Ignoring reply ' + JSON.stringify(data);
                $.ca.$.log && $.ca.$.log.trace(logMsg);
            }
        };

        // transactional ops
        var target = {
            async getUserInfoImpl(id, user) {
                try {
                    var data = await $._.$.users.getUserInfo(user);
                    handleReply(id, data);
                    return [];
                } catch (err) {
                    /* If we are here, there was a programming error.
                     It should never throw, always returning
                     errors in the first entry of a tuple.*/
                    return [err];
                }
            },
            async registerUserImpl(id) {
                var reply = [null];
                try {
                    reply[1] = await $._.$.users.registerUser(owner);
                } catch (err) {
                    reply[0] = err;
                }
                handleReply(id, reply);
                return [];
            },
            async registerAppImpl(id, app) {
                var reply = [null];
                try {
                    reply[1] = await $._.$.users.registerApp(app);
                } catch (err) {
                    reply[0] = err;
                }
                handleReply(id, reply);
                return [];
            },
            async registerCAImpl(id, ca) {
                var reply = [null];
                try {
                    reply[1] = await $._.$.users.registerCA(ca);
                } catch (err) {
                    reply[0] = err;
                }
                handleReply(id, reply);
                return [];
            },
            async listUsersPrivilegedImpl(id) {
                var reply = [null];
                try {
                    reply[1] = await $._.$.users.listUsers();
                } catch (err) {
                    reply[0] = err;
                }
                handleReply(id, reply);
                return [];
            },
            async changeUnitsPrivilegedImpl(id, user, units) {
                var reply = [null];
                try {
                    reply[1] = await $._.$.users.changeUnits(id, user, units);
                } catch (err) {
                    reply[0] = err;
                }
                handleReply(id, reply);
                return [];
            },
            async setHandleReplyMethodImpl(methodName) {
                handleMethod = methodName;
                return [];
            }
        };

        that.__ca_setLogActionsTarget__(target);

        that.getUserInfo = function() {
            var id = 'getUserInfo_' + myUtils.uniqueId();
            that.__ca_lazyApply__('getUserInfoImpl', [id, owner]);
            return id;
        };


        that.registerUser = function() {
            var id = 'registerUser_' + myUtils.uniqueId();
            that.__ca_lazyApply__('registerUserImpl', [id]);
            return id;
        };

        var extractToken = function(tokenStr) {
            var token = $._.$.security &&
                    $._.$.security.__ca_verifyToken__ (tokenStr);
            if (!$._.$.security) {
                var err = new Error('Security Disabled: Cannot validate token');
                err['tokenStr'] = tokenStr.slice(0, 10);
                throw err;
            }

            if (!token) {
                err = new Error('Invalid Token');
                err['tokenStr'] = tokenStr.slice(0, 10);
                throw err;
            } else {
                if (token.caOwner !== owner) {
                    err = new Error('Token not matching current app or CA');
                    err['tokenStr'] = tokenStr.slice(0, 10);
                    throw err;
                } else {
                    return token;
                }
            }
        };

        that.registerCA = function(tokenStr) {
            var id = 'registerCA_' + myUtils.uniqueId();
            var token = extractToken(tokenStr);
            var ca = json_rpc.joinName(token.appPublisher, token.appLocalName,
                                       token.caOwner, token.caLocalName);
            that.__ca_lazyApply__('registerCAImpl', [id, ca]);
            return id;
        };

        that.registerApp = function(tokenStr) {
            var id = 'registerApp_' + myUtils.uniqueId();
            var token = extractToken(tokenStr);
            if (token.appPublisher === owner) {
                var app = json_rpc.joinName(token.appPublisher,
                                            token.appLocalName);
                that.__ca_lazyApply__('registerAppImpl', [id, app]);
                return id;
            } else {
                var err = new Error('App owner in token not matching');
                err['tokenStr'] = tokenStr.slice(0, 10);
                throw err;
            }
        };

        that.getUserInfoPrivileged = function(user) {
            checkPrivileged();
            var id = 'getUserInfoPrivileged_' + myUtils.uniqueId();
            that.__ca_lazyApply__('getUserInfoImpl', [id, user]);
            return id;
        };

        that.changeUnitsPrivileged = function(user, units) {
            checkPrivileged();
            var id = 'changeUnitsPrivileged_' + myUtils.uniqueId();
            that.__ca_lazyApply__('changeUnitsPrivilegedImpl', [id, user,
                                                                units]);
            return id;
        };

        that.listUsersPrivileged = function() {
            checkPrivileged();
            var id = 'listUsersPrivileged_' + myUtils.uniqueId();
            that.__ca_lazyApply__('listUsersPrivilegedImpl', [id]);
            return id;
        };


        that.setHandleReplyMethod = function(methodName) {
            that.__ca_lazyApply__('setHandleReplyMethodImpl', [methodName]);
        };

        var super__ca_resume__ =
                myUtils.superiorPromisify(that, '__ca_resume__');
        that.__ca_resume__ = async function(cp) {
            try {
                if (cp) { // backwards compatible...
                    handleMethod = cp.handleMethod;
                    await super__ca_resume__(cp);
                }
                return [];
            } catch (err) {
                return [err];
            }
        };

        var super__ca_prepare__ =
                myUtils.superiorPromisify(that, '__ca_prepare__');
        that.__ca_prepare__ = async function() {
            try {
                var data = await super__ca_prepare__();
                data.handleMethod = handleMethod;
                return [null, data];
            } catch (err) {
                return [err];
            }
        };

        return [null, that];
    } catch (err) {
        return [err];
    }
};

'use strict';

/**
 * Manages user profiles for this CA.
 *
 *
 * @module caf_users/plug_ca_users
 * @augments external:caf_components/gen_plug_ca
 */
// @ts-ignore: augments not attached to a class
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

        var genericImpl = async function(methodName, id, argsArray) {
            var reply = [null];
            try {
                let method = $._.$.users[methodName];
                reply[1] = await method.apply(method, argsArray);
            } catch (err) {
                reply[0] = err;
            }
            handleReply(id, reply);
            return [];

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
                return genericImpl('registerUser', id, [owner]);
            },
            async registerAppImpl(id, app) {
                return genericImpl('registerApp', id, [app]);
            },
            async registerCAImpl(id, ca) {
                return genericImpl('registerCA', id, [ca]);
            },
            async listUsersPrivilegedImpl(id) {
                return genericImpl('listUsers', id, []);
            },
            async changeUnitsPrivilegedImpl(id, user, units) {
                return genericImpl('changeUnits', id, [id, user, units]);
            },
            async transferUnitsImpl(id, from, to, units) {
                // tid === id === nonce
                return genericImpl('transferUnits', id, [
                    id, from, to, units, id
                ]);
            },
            async releaseTransferImpl(id, from, tid) {
                return genericImpl('releaseTransfer', id, [from, tid]);
            },
            async expireTransferImpl(id, from, to, units, tid) {
                return genericImpl('expireTransfer', id, [
                    from, to, units, tid
                ]);
            },
            async acceptTransferImpl(id, from, to, units, tid) {
                return genericImpl('acceptTransfer', id, [
                    from, to, units, tid
                ]);
            },
            async disputeTransferImpl(id, from, to, units, tid) {
                return genericImpl('disputeTransfer', id, [
                    from, to, units, tid
                ]);
            },

            async setHandleReplyMethodImpl(methodName) {
                handleMethod = methodName;
                return [];
            }
        };

        that.__ca_setLogActionsTarget__(target);

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


            var ca = json_rpc.joinNameArray([
                json_rpc.joinName(token.appPublisher, token.appLocalName),
                json_rpc.joinName(token.caOwner, token.caLocalName)
            ], json_rpc.APP_SEPARATOR);

            that.__ca_lazyApply__('registerCAImpl', [id, ca]);
            return id;
        };

        that.dirtyRegisterCA = function(tokenStr) {
            var token = extractToken(tokenStr);
            var ca = json_rpc.joinNameArray([
                json_rpc.joinName(token.appPublisher, token.appLocalName),
                json_rpc.joinName(token.caOwner, token.caLocalName)
            ], json_rpc.APP_SEPARATOR);

            return $._.$.users.registerCA(ca);
        };

        that.dirtyCheckCA = function(fqn) {
            var checkFQN = function() {
                var c = json_rpc.splitName(fqn, json_rpc.APP_SEPARATOR);
                var app = json_rpc.splitName(c[0]);
                var ca = json_rpc.splitName(c[1]);
                if ((c.length !== 2) || (app.length !== 2) ||
                    (ca.length !== 2)) {
                    throw (new Error('Invalid name ' + fqn));
                }
            };

            checkFQN();
            return $._.$.users.checkCA(fqn);
        };

        that.dirtyCheckApp = function(app) {
            var checkApp = function() {
                var appSplit = json_rpc.splitName(app);
                if (appSplit.length !== 2) {
                    throw (new Error('Invalid app name ' + app));
                }
            };
            checkApp();
            return $._.$.users.describeApp(app);
        };

        that.registerApp = function(tokenStr) {
            var id = 'registerApp_' + myUtils.uniqueId();
            var token = extractToken(tokenStr);
            if ((token.appPublisher === owner) &&
                (token.caOwner === owner)) {
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

        that.transferUnits = function(to, units) {
            var id = 'transferUnits_' + myUtils.uniqueId();
            that.__ca_lazyApply__('transferUnitsImpl', [id, owner, to, units]);
            return id;
        };

        that.releaseTransfer = function(id) {
            var reqId = 'releaseTransfer_' + myUtils.uniqueId();
            that.__ca_lazyApply__('releaseTransferImpl', [reqId, owner, id]);
            return reqId;
        };

        that.expireTransfer = function(to, units, id) {
            var reqId = 'expireTransfer_' + myUtils.uniqueId();
            that.__ca_lazyApply__('expireTransferImpl', [
                reqId, owner, to, units, id
            ]);
            return reqId;
        };

        that.acceptTransfer = function(from, units, id) {
            var reqId = 'acceptTransfer_' + myUtils.uniqueId();
            that.__ca_lazyApply__('acceptTransferImpl',
                                  [reqId, from, owner, units, id]);
            return reqId;
        };

        that.disputeTransfer = function(from, units, id) {
            var reqId = 'disputeTransfer_' + myUtils.uniqueId();
            that.__ca_lazyApply__('disputeTransferImpl',
                                  [reqId, from, owner, units, id]);
            return reqId;
        };

        that.dirtyDescribeTransfer = function(id) {
            return $._.$.users.describeTransfer(id);
        };

        that.dirtyDescribeReputation = function(username) {
            return $._.$.users.describeReputationExternal(username);
        };

        that.getUserInfo = function(user) {
            user = user || owner;
            if (user !== owner) {
                checkPrivileged();
            }
            var id = 'getUserInfo_' + myUtils.uniqueId();
            that.__ca_lazyApply__('getUserInfoImpl', [id, user]);
            return id;
        };

        that.changeUnitsPrivileged = function(user, units) {
            checkPrivileged();
            var id = 'changeUnitsPrivileged_' + myUtils.uniqueId();
            that.__ca_lazyApply__('changeUnitsPrivilegedImpl',
                                  [id, user, units]);
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

'use strict';

/**
 * Manages user profiles for this CA.
 *
 *
 * @module caf_users/plug_ca_users
 * @augments external:caf_components/gen_plug_ca
 */
// @ts-ignore: augments not attached to a class
const caf_comp = require('caf_components');
const myUtils = caf_comp.myUtils;
const genPlugCA = caf_comp.gen_plug_ca;
const json_rpc = require('caf_transport').json_rpc;
const DOLLARS_PER_UNIT = 0.1;

exports.newInstance = async function($, spec) {
    try {
        const that = genPlugCA.create($, spec);

        /*
         * The contents of this variable are always checkpointed before
         * any state externalization (see `gen_transactional`).
         */
        that.state = {}; // handleMethod:string

        const owner = json_rpc.splitName($.ca.__ca_getName__())[0];

        const checkPrivileged = function() {
            if (owner !== 'root') {
                throw new Error('Not enough privileges to call this method');
            }
        };

        const handleReply = function(id, data) {
            if (that.state.handleMethod) {
                /* Response processed in a separate transaction, i.e.,
                 using a fresh message */
                const m = json_rpc.systemRequest($.ca.__ca_getName__(),
                                                 that.state.handleMethod,
                                                 id, data);
                $.ca.__ca_process__(m, function(err) {
                    err && $.ca.$.log &&
                        $.ca.$.log.error('Got handler exception ' +
                                         myUtils.errToPrettyStr(err));
                });
            } else {
                const logMsg = 'Ignoring reply ' + JSON.stringify(data);
                $.ca.$.log && $.ca.$.log.trace(logMsg);
            }
        };

        const genericImpl = async function(methodName, id, argsArray) {
            const reply = [null];
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
        const target = {
            async getUserInfoImpl(id, user) {
                try {
                    const data = await $._.$.users.getUserInfo(user);
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
            async updateAppPrivilegedImpl(id, appName, timePerUnit) {
                return genericImpl('updateApp', id, [appName, timePerUnit]);
            },
            async computeAppUsagePrivilegedImpl() {
                $._.$.users.computeAppUsage(); //It takes too long, don't await
                return [];
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
                that.state.handleMethod = methodName;
                return [];
            }
        };

        that.__ca_setLogActionsTarget__(target);

        that.registerUser = function() {
            const id = 'registerUser_' + myUtils.uniqueId();
            that.__ca_lazyApply__('registerUserImpl', [id]);
            return id;
        };

        const extractToken = function(tokenStr) {
            const token = $._.$.security &&
                    $._.$.security.__ca_verifyToken__ (tokenStr);
            if (!$._.$.security) {
                const err = new Error('Security Disabled: Cannot validate ' +
                                      'token');
                err['tokenStr'] = tokenStr.slice(0, 10);
                throw err;
            }

            if (!token) {
                const err = new Error('Invalid Token');
                err['tokenStr'] = tokenStr.slice(0, 10);
                throw err;
            } else {
                if (token.caOwner !== owner) {
                    const err = new Error('Token not matching current app'
                                          + ' or CA');
                    err['tokenStr'] = tokenStr.slice(0, 10);
                    throw err;
                } else {
                    return token;
                }
            }
        };

        that.registerCA = function(tokenStr) {
            const id = 'registerCA_' + myUtils.uniqueId();
            const token = extractToken(tokenStr);


            const ca = json_rpc.joinNameArray([
                json_rpc.joinName(token.appPublisher, token.appLocalName),
                json_rpc.joinName(token.caOwner, token.caLocalName)
            ], json_rpc.APP_SEPARATOR);

            that.__ca_lazyApply__('registerCAImpl', [id, ca]);
            return id;
        };

        that.dirtyRegisterCA = function(tokenStr) {
            const token = extractToken(tokenStr);
            const ca = json_rpc.joinNameArray([
                json_rpc.joinName(token.appPublisher, token.appLocalName),
                json_rpc.joinName(token.caOwner, token.caLocalName)
            ], json_rpc.APP_SEPARATOR);

            return $._.$.users.registerCA(ca);
        };

        that.dirtyCheckCA = function(fqn) {
            const checkFQN = function() {
                const c = json_rpc.splitName(fqn, json_rpc.APP_SEPARATOR);
                const app = json_rpc.splitName(c[0]);
                const ca = json_rpc.splitName(c[1]);
                if ((c.length !== 2) || (app.length !== 2) ||
                    (ca.length !== 2)) {
                    throw (new Error('Invalid name ' + fqn));
                }
            };

            checkFQN();
            return $._.$.users.checkCA(fqn);
        };

        that.dirtyCheckApp = function(app) {
            const checkApp = function() {
                const appSplit = json_rpc.splitName(app);
                if (appSplit.length !== 2) {
                    throw (new Error('Invalid app name ' + app));
                }
            };
            checkApp();
            return $._.$.users.describeApp(app);
        };

        that.registerApp = function(tokenStr) {
            const id = 'registerApp_' + myUtils.uniqueId();
            const token = extractToken(tokenStr);
            if ((token.appPublisher === owner) &&
                (token.caOwner === owner)) {
                const app = json_rpc.joinName(token.appPublisher,
                                              token.appLocalName);
                that.__ca_lazyApply__('registerAppImpl', [id, app]);
                return id;
            } else {
                const err = new Error('App owner in token not matching');
                err['tokenStr'] = tokenStr.slice(0, 10);
                throw err;
            }
        };

        that.getAppUsage = function(appName) {
            const appSplit = json_rpc.splitName(appName);
            if (appSplit.length !== 2) {
                throw new Error('Invalid app name ' + appName);
            }
            if (appSplit[0] !== owner) {
                checkPrivileged();
            }
            return $._.$.users.getAppUsage(appName);
        };

        that.transferUnits = function(to, units) {
            const id = 'transferUnits_' + myUtils.uniqueId();
            that.__ca_lazyApply__('transferUnitsImpl', [id, owner, to, units]);
            return id;
        };

        that.releaseTransfer = function(id) {
            const reqId = 'releaseTransfer_' + myUtils.uniqueId();
            that.__ca_lazyApply__('releaseTransferImpl', [reqId, owner, id]);
            return reqId;
        };

        that.expireTransfer = function(to, units, id) {
            const reqId = 'expireTransfer_' + myUtils.uniqueId();
            that.__ca_lazyApply__('expireTransferImpl', [
                reqId, owner, to, units, id
            ]);
            return reqId;
        };

        that.acceptTransfer = function(from, units, id) {
            const reqId = 'acceptTransfer_' + myUtils.uniqueId();
            that.__ca_lazyApply__('acceptTransferImpl',
                                  [reqId, from, owner, units, id]);
            return reqId;
        };

        that.disputeTransfer = function(from, units, id) {
            const reqId = 'disputeTransfer_' + myUtils.uniqueId();
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

        that.dirtyDescribeAllocated = function() {
            return $._.$.users.describeAllocated();
        };

        that.getUserInfo = function(user) {
            user = user || owner;
            if (user !== owner) {
                checkPrivileged();
            }
            const id = 'getUserInfo_' + myUtils.uniqueId();
            that.__ca_lazyApply__('getUserInfoImpl', [id, user]);
            return id;
        };

        that.updateAppPrivileged = function(appName, timePerUnit) {
            checkPrivileged();
            const id = 'updateAppPrivileged_' + myUtils.uniqueId();
            that.__ca_lazyApply__('updateAppPrivilegedImpl',
                                  [id, appName, timePerUnit]);
            return id;
        };

        that.computeAppUsagePrivileged = function() {
            checkPrivileged();
            that.__ca_lazyApply__('computeAppUsagePrivilegedImpl', []);
        };

        that.changeUnitsPrivileged = function(user, units) {
            checkPrivileged();
            const id = 'changeUnitsPrivileged_' + myUtils.uniqueId();
            that.__ca_lazyApply__('changeUnitsPrivilegedImpl',
                                  [id, user, units]);
            return id;
        };

        that.listUsersPrivileged = function() {
            checkPrivileged();
            const id = 'listUsersPrivileged_' + myUtils.uniqueId();
            that.__ca_lazyApply__('listUsersPrivilegedImpl', [id]);
            return id;
        };


        that.setHandleReplyMethod = function(methodName) {
            that.__ca_lazyApply__('setHandleReplyMethodImpl', [methodName]);
        };

        that.buyUnitsPrivileged = function(user, units) {
            checkPrivileged();
            const id = that.changeUnitsPrivileged(user, units);
            if ($.ca.$.bank) {
                const balance = $.ca.$.bank.getBalance();
                const reason = {id: id, user: user, reason: 'buyUnits'};
                $.ca.$.bank.changeBalance(balance, units * DOLLARS_PER_UNIT,
                                          JSON.stringify(reason));
            }
        };

        const super__ca_resume__ =
                myUtils.superiorPromisify(that, '__ca_resume__');
        that.__ca_resume__ = async function(cp) {
            try {
                if (cp) {
                    // backwards compatible...
                    await super__ca_resume__(cp);
                    that.state.handleMethod = that.state.handleMethod ||
                        cp.handleMethod;
                }
                return [];
            } catch (err) {
                return [err];
            }
        };

        return [null, that];
    } catch (err) {
        return [err];
    }
};

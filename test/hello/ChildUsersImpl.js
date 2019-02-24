var caf_comp = require('caf_components');

var genComponent =  caf_comp.gen_component;


/**
 * Factory method to create a test component.
 *
 * @see supervisor
 */
exports.newInstance = async function($, spec) {
    try {
        var that = genComponent.constructor($, spec);
        var uuid = Math.floor(Math.random() *1000000);
        var state = {uuid: uuid};
        var cp = 'cp';

       var arrayToObject = function(arr) {
            var res = {};
            var key = null;
            for (var i=0; i<arr.length; i++) {
                if (i%2 === 0) {
                    key = arr[i];
                } else {
                    res[key] = arr[i];
                }
            }
           return res;
       };

        that.getUUID = async function() {
            return uuid;
        };

        that.init = async function(users, apps) {
            await Promise.all(users.map(async (user) =>  await $._.$[cp]
                                        .registerUser(user)));
            await Promise.all(apps.map(async (app) =>  await $._.$[cp]
                                       .registerApp(app)));
            state.users = users;
            state.apps = apps;
            state.cas = {};
            return [];
        };

        that.registerCAs = async function(cas) {
            try {
                var all = await Promise.all(cas.map(async function(ca) {
                    var p = await $._.$[cp].registerCA(ca);
                    console.log('Registered: ' + ca + ' Result:' +
                                JSON.stringify(p)) ;
                }));
                cas.forEach((ca) => {state.cas[ca] = true;});
                return [null, all];
            } catch (err) {
                console.log('Error: ' + JSON.stringify(err));
                console.log('Error: ' + err.err.message);
                return [err.err];
            }
        };

        that.checkCA = async function(ca) {
            try {
                var result = await $._.$[cp].checkCA(ca);
                return [null, result];
            } catch (err) {
                return [err];
            }
        };

        that.changeUnits = async function(nonce, user, delta) {
            try {
                var result;
                if (delta > 0) {
                    result = await $._.$[cp].addUnits(nonce, user, delta);
                } else {
                    result = await $._.$[cp].removeUnits(nonce, user, -delta);
                }
                return [null, result];
            } catch (err) {
                return [err];
            }
        };

        that.getUserInfo = async function(user) {
            return $._.$[cp].getUserInfo(user);
        };

        that.describeAll = async function() {

            var result = await that.listAll();
            result = result[1];
            console.log('listAll: ' + JSON.stringify(result));
            result.users = {};
            await Promise.all(state.users.map(async function (user) {
                result.users[user] = await $._.$[cp].describeUser(user);
            }));
/*            await Promise.all(state.apps.map(async function(app) {
                result.apps[app] = await $._.$[cp].describeApp(app);
            }));
            await Promise.all(Object.keys(state.cas).map(async function(ca) {
                result.cas[ca] = await $._.$[cp].describeCA(ca);
            }));
 */
            return [null, result];
        };

        that.listAll = async function() {
            var users = await $._.$[cp].listUsers();
            var result = {};
            await Promise.all(users.map(async (user) => {
                var apps = arrayToObject(await $._.$[cp].listApps(user));
                var cas = arrayToObject(await $._.$[cp].listCAs(user));
                result[user] = {apps: apps, cas: cas};
            }));
            return [null, result];
        };

        return [null, that];
    } catch (err) {
        console.log('got err' + err);
        return [err];
    }
};

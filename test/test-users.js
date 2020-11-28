var hello = require('./hello/main.js');
var caf_comp = require('caf_components');
var async = caf_comp.async;
var myUtils = caf_comp.myUtils;
var util = require('util');

process.on('uncaughtException', function (err) {
    console.log("Uncaught Exception: " + err);
    console.log(err.stack);
    //console.log(myUtils.errToPrettyStr(err));
    process.exit(1);

});

var setTimeoutAsync = util.promisify(setTimeout);

var USERS = ['john', 'alice', 'bob'];
var USERS2 = ['john2', 'alice2', 'bob2'];
var APPS = ['john-play1', 'alice-play2'];
var CAS = ['john-play1#bob-x1', 'alice-play2#bob-x2',
           'john-play1#alice-x1', 'alice-play2#alice-x2'];

var appName = 'foo-test' + myUtils.uniqueId();

module.exports = {
    setUp: function (cb) {
        var self = this;
        hello.load(null, {env : {appName: appName}}, 'helloUsers.json', null,
                   function(err, $) {
                       self.$ = $;
                       cb(err, $);
                   });
    },

    tearDown: function (cb) {
        this.$.topRedis.__ca_shutdown__(null, cb);
    },

    helloworld: async function (test) {
        var self = this;
        test.expect(23);
        try {
            await this.$._.$.users.init(USERS, APPS);
            var listAll = await this.$._.$.users.listAll();
            console.log(JSON.stringify(listAll[1]));

            test.ok(Object.keys(listAll[1]).length === 3);
            test.ok(Object.keys(listAll[1].alice.apps).length === 1);
            test.ok(Object.keys(listAll[1].john.apps).length === 1);
            test.ok(Object.keys(listAll[1].bob.apps).length === 0);

            // vanilla create
            var res = await this.$._.$.users.registerCAs(CAS);
            console.log(JSON.stringify(res));
            var describeAll = await this.$._.$.users.describeAll();
            console.log(JSON.stringify(describeAll[1]));
            test.ok(describeAll[1].users.john === "3.398");
            test.ok(describeAll[1].users.alice === "1.398");
            test.ok(describeAll[1].users.bob === "1");

            // trigger user stats
            await this.$._.$.users.computeAppUsage();
            const allApps = this.$._.$.users.getAppUsage(APPS);
            console.log(allApps);
            test.ok(allApps[0][0].count === 2);
            test.ok(allApps[1][0].count === 2);

            // Show that appends to user stats
            await this.$._.$.users.computeAppUsage();
            const allApps2 = this.$._.$.users.getAppUsage(APPS);
            console.log(allApps2);
            test.ok(allApps2[0][1].count === 2);
            test.ok(allApps2[1][1].count === 2);

            // Does not create new ones if not expired
            await this.$._.$.users.registerCAs(['john-play1#bob-x1']);
            describeAll = await this.$._.$.users.describeAll();
            console.log(JSON.stringify(describeAll[1]));
            test.ok(describeAll[1].users.john === "3.398");
            test.ok(describeAll[1].users.bob === "1");

            // empty bob account
            await this.$._.$.users.registerCAs(['john-play1#bob-x2']);
            describeAll = await this.$._.$.users.describeAll();
            console.log(JSON.stringify(describeAll[1]));
            test.ok(describeAll[1].users.john === "4.097");
            test.ok(describeAll[1].users.bob === "0");


            // but it does when it expires
            await setTimeoutAsync(16000);
            res = await this.$._.$.users.registerCAs(['john-play1#bob-x1']);
            console.log(JSON.stringify(res));
            test.ok(res[0]); // not enough units
            describeAll = await this.$._.$.users.describeAll();
            console.log(JSON.stringify(describeAll[1]));

            //check that it expired
            res = await this.$._.$.users.checkCA('john-play1#bob-x1');
            console.log(JSON.stringify(res));
            test.ok(res[1] < 0); // not enough units

            // let's add units
            await this.$._.$.users.changeUnits('23233', 'bob', 1.0);
            describeAll = await this.$._.$.users.describeAll();
            console.log(JSON.stringify(describeAll));
            test.ok(describeAll[1].users.bob === "1");

            // let's try again with enough units
            res = await this.$._.$.users.registerCAs(['john-play1#bob-x1']);
            console.log(JSON.stringify(res));
            test.ok(!res[0]); // enough units
            describeAll = await this.$._.$.users.describeAll();
            console.log(JSON.stringify(describeAll[1]));
            test.ok(describeAll[1].users.bob === "0");

            //check that it is now ok
            res = await this.$._.$.users.checkCA('john-play1#bob-x1');
            console.log(JSON.stringify(res));
            test.ok(res[1] > 0);

            // getUserInfo
            res = await this.$._.$.users.getUserInfo('alice');
            console.log('ALICE: ' + JSON.stringify(res));
            test.ok(!res[0]);
            test.ok(res[1].user === 1.398);
            test.done();
        } catch (err) {
            test.ifError(err);
            test.done();
        }

    },

    transfers: async function (test) {
        test.expect(40);
        try {
            await this.$._.$.users.init(USERS2, []);

            // transfer OK
            var res = await this.$._.$.users.transferOK('john2', 'alice2', 1);
            test.ok(!res[0]);
            res = res[1];
            console.log(JSON.stringify(res));
            test.ok(res.id);
            test.ok(res.t[9] === 'true'); // released
            test.ok(res.userFrom[1].user === 2); // escrow
            test.ok(res.userFrom2[1].user === 2); // final
            test.ok(res.userTo[1].user === 3); // before
            test.ok(res.userTo2[1].user === 4); // final

            test.ok(res.userFrom2[1].reputation.completed === 1);
            test.ok(res.userTo2[1].reputation.completed === 1);

            test.ok(Object.keys(res.userFrom[1].offers).length === 1);
            test.ok(Object.keys(res.userFrom2[1].offers).length === 0);
            test.ok(Object.keys(res.userTo[1].accepts).length === 1);
            test.ok(Object.keys(res.userTo2[1].accepts).length === 0);

            // transfer disputed
            res = await this.$._.$.users.transferDisputed('john2', 'alice2', 1);
            test.ok(!res[0]);
            res = res[1];
            console.log(JSON.stringify(res));
            test.ok(res.t[9] === 'false'); // released
            test.ok(res.userFrom[1].user === 1); // escrow
            test.ok(res.userFrom2[1].user === 2); // final
            test.ok(res.userTo[1].user === 4); // before
            test.ok(res.userTo2[1].user === 4); // final

            test.ok(res.userFrom2[1].reputation.disputed === 1);
            test.ok(res.userTo2[1].reputation.disputed === 1);

            test.ok(Object.keys(res.userFrom[1].offers).length === 1);
            test.ok(Object.keys(res.userFrom2[1].offers).length === 0);
            test.ok(Object.keys(res.userTo[1].accepts).length === 1);
            test.ok(Object.keys(res.userTo2[1].accepts).length === 0);


            // transfer disputed after release
            res = await this.$._.$.users.transferDisputedAfterRelease('john2',
                                                                      'alice2',
                                                                      1);
            test.ok(res[0]);

            // transfer expired
            res = await this.$._.$.users.transferExpired('john2',
                                                         'alice2',
                                                         1);
            test.ok(!res[0]);
            res = res[1];
            console.log(JSON.stringify(res));
            test.ok(res.t[9] === 'false'); // released
            test.ok(res.userFrom[1].user === 1); // escrow
            test.ok(res.userFrom2[1].user === 2); // final
            test.ok(res.userTo[1].user === 4); // before
            test.ok(res.userTo2[1].user === 4); // final

            test.ok(res.userFrom2[1].reputation.disputed === 1);
            test.ok(res.userTo2[1].reputation.disputed === 1);

            // "disputed after release" added one to expired
            test.ok(res.userFrom2[1].reputation.expired === 2);
            test.ok(res.userTo2[1].reputation.expired === 2);

            test.ok(Object.keys(res.userFrom[1].offers).length === 1);
            test.ok(Object.keys(res.userFrom2[1].offers).length === 0);
            test.ok(Object.keys(res.userTo[1].accepts).length === 1);
            test.ok(Object.keys(res.userTo2[1].accepts).length === 0);

            test.done();
        } catch (err) {
            test.ifError(err);
            test.done();
        }
    }


};

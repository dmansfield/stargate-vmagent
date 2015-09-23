var NegotiateStrategy   = require('passport-negotiate').Strategy;

module.exports = function(passport) {
    passport.serializeUser(function(user, done) {
        done(null, user.principal);
    });

    passport.deserializeUser(function(id, done) {
        process.nextTick(function() {
            done(null, {"principal": id});
        });
    });

    passport.use('login', 
        new NegotiateStrategy(function(principal, done) {
            process.nextTick(function() {
               done(null, {"principal": principal}); 
            });
        })
    );
};

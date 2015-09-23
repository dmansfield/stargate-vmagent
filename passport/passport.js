var NegotiateStrategy   = require('passport-negotiate').Strategy;

module.exports = function(passport) {
    function userFromPrincipal(principal) {
        return {
            "principal":principal
            , "user": principal.substring(0, principal.indexOf('@'))
        }
    }
    
    passport.serializeUser(function(user, done) {
        done(null, user.principal);
    });

    passport.deserializeUser(function(id, done) {
        process.nextTick(function() {
            done(null, userFromPrincipal(id));
        });
    });

    passport.use('login', 
        new NegotiateStrategy(function(principal, done) {
            process.nextTick(function() {
               done(null, userFromPrincipal(principal)); 
            });
        })
    );
};

var passport = require('passport')
var session = require('express-session')
var MongoStore = require('connect-mongo')(session);
var LocalStrategy = require('passport-local').Strategy
var mongoose = require('mongoose')
var bcrypt = require('bcrypt')
var nodemailer = require('nodemailer')
var async = require("async")
var crypto = require('crypto')

var SALT_WORK_FACTOR = 10;

// User Schema
var userSchema = mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true},
  activeTab: { type: Number, default: 0 },
  categories: [String],
  categoryProxy: [Number],
  resetPasswordToken: String,
  resetPasswordExpires: Date
});

// Bcrypt middleware
userSchema.pre('save', function(next) {
    var user = this;

    if(!user.isModified('password')) return next();

    bcrypt.genSalt(SALT_WORK_FACTOR, function(err, salt) {
        if(err) return next(err);

        bcrypt.hash(user.password, salt, function(err, hash) {
            if(err) return next(err);
            user.password = hash;
            next();
        });
    });
});

// Password verification
userSchema.methods.comparePassword = function(candidatePassword, cb) {
    bcrypt.compare(candidatePassword, this.password, function(err, isMatch) {
        if(err) return cb(err);
        cb(null, isMatch);
    });
};

var User = mongoose.model('Users', userSchema);

// Passport session setup.
//   To support persistent login sessions, Passport needs to be able to
//   serialize users into and deserialize users out of the session.  Typically,
//   this will be as simple as storing the user ID when serializing, and finding
//   the user by ID when deserializing.
passport.serializeUser(function(user, done) {
  done(null, user.id);
});

passport.deserializeUser(function(id, done) {
  User.findById(id, function (err, user) {
    done(err, user);
  });
});

// Use the LocalStrategy within Passport.
//   Strategies in passport require a `verify` function, which accept
//   credentials (in this case, a username and password), and invoke a callback
//   with a user object.  In the real world, this would query a database;
//   however, in this example we are using a baked-in set of users.
passport.use(new LocalStrategy(function(username, password, done) {
  User.findOne({ username: username }, function(err, user) {
    if (err) { return done(err); }
    if (!user) { return done(null, false, { message: 'Unknown user ' + username }); }
    user.comparePassword(password, function(err, isMatch) {
      if (err) return done(err);
      if(isMatch) {
        return done(null, user);
      } else {
        return done(null, false, { message: 'Invalid password' });
      }
    });
  });
}));

/*
global.app.use(session({
    store: new MongoStore({
      db : "sessions",
    }),
    secret: 'a_very_secret_secret', 
    resave: true,
    saveUninitialized: true,
    expires: new Date(Date.now() + 900000),
    httpOnly: true
  }));


global.app.use(session({ secret: 'a_very_secret_secret', resave: true, saveUninitialized: true, expires: new Date(Date.now() + 900000), httpOnly: true }));
*/
// Initialize Passport!  Also use passport.session() middleware, to support
// persistent login sessions (recommended).
global.app.use(passport.initialize());
global.app.use(passport.session());

exports.loginGet = function(req, res){
    
    res.render('login');
};

exports.loginPost = function(req, res, next){
    if(req.body.username && req.body.password) {
        User.findOne({ username: req.body.username }, function(err, user) {
            if(err) {
                console.log(err);
                return res.redirect('/login');
            }        


  passport.authenticate('local', function(err, user, info) {

    if (err) { return next(err) }
    if (!user) {
      req.session.messages =  [info.message];
      return res.redirect('/login')
    }
    req.logIn(user, function(err) {
      if (err) { return next(err); }
/*
      user.categories = [];
      user.categories.push("Grontmij");
      user.categories.push("Accretion");
      user.categories.push("KDirchainRebuild");
      user.categories.push("Random");
      user.save();
*/
      return res.redirect('/');
    });
  })(req, res, next);
            return;

        });
    } else {
        return res.redirect('/login');
    }
};

exports.registerGet = function(req, res){
    
    res.render('register');
};

exports.registerPost = function(req, res){
    if(req.body.username && req.body.password && req.body.password_verify && req.body.email) {
        if(req.body.password == req.body.password_verify) {
            var user = new User({ username: req.body.username, password: req.body.password, email: req.body.email});
            user.categories.push("Default notes");
            user.categoryProxy.push(0);
            user.save(function(err) {
                if(err) {
                    console.log(err);
                } else {
                    console.log('user: ' + user.username + " saved.");
                }
            });
        }
    }
    res.redirect('/');
};

exports.logout = function(req, res){
    req.logout();
    res.redirect('/');
};

exports.forgotGet = function(req, res){
    res.render('forgot');
};

exports.forgotPost = function(req, res){
  async.waterfall([
    function(done) {
      crypto.randomBytes(20, function(err, buf) {
        var token = buf.toString('hex');
        done(err, token);
      });
    },
    function(token, done) {
      User.findOne({ email: req.body.email }, function(err, user) {
        if (!user) {
          req.send('No account with that email address exists.');
          return res.redirect('/forgot');
        }

        user.resetPasswordToken = token;
        user.resetPasswordExpires = Date.now() + 3600000; // 1 hour

        user.save(function(err) {
          done(err, token, user);
        });
      });
    },
    function(token, user, done) {
/*
      var smtpTransport = nodemailer.createTransport('SMTP', {
        service: 'Gmail',
        auth: {
          user: '!!! YOUR SENDGRID USERNAME !!!',
          pass: '!!! YOUR SENDGRID PASSWORD !!!'
        }
      });
*/
      var smtpTransport = nodemailer.createTransport();
      var mailOptions = {
        to: user.email,
        from: 'markg85@gmail.com',
        subject: 'Sticky Nodes Password Reset',
        text: 'You are receiving this because you (or someone else) have requested the reset of the password for your account.\n\n' +
          'Please click on the following link, or paste this into your browser to complete the process:\n\n' +
          'http://' + req.headers.host + '/reset/' + token + '\n\n' +
          'If you did not request this, please ignore this email and your password will remain unchanged.\n'
      };
      smtpTransport.sendMail(mailOptions, function(err) {
      });
    }
  ], function(err) {
    if (err) return next(err);
  });

    return res.redirect('/');
};

exports.resetGet = function(req, res){
  User.findOne({ resetPasswordToken: req.params.token, resetPasswordExpires: { $gt: Date.now() } }, function(err, user) {
    if (!user) {
      req.flash('error', 'Password reset token is invalid or has expired.');
      return res.redirect('/forgot');
    }
    res.render('reset', {
      token: req.params.token
    });
  });
};

exports.resetPost = function(req, res){
  async.waterfall([
    function(done) {
      User.findOne({ resetPasswordToken: req.params.token, resetPasswordExpires: { $gt: Date.now() } }, function(err, user) {
        if (!user || req.body.password != req.body.password_verify) {
            console.log("Failed to reset password.")
        }

        user.password = req.body.password;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;

        user.save(function(err) {
          console.log("Reset should be ok.")
          req.logIn(user, function(err) {
            done(err, user);
          });
        });
      });
    },
    function(user, done) {
      var smtpTransport = nodemailer.createTransport();
      var mailOptions = {
        to: user.email,
        from: 'markg85@gmail.com',
        subject: 'Your password has been changed',
        text: 'Hello,\n\n' +
          'This is a confirmation that the password for your account ' + user.email + ' has just been changed.\n'
      };
      smtpTransport.sendMail(mailOptions, function(err) {
      });
    }
  ], function(err) {
      console.log("Err... Geen idee wat er mis is.")
      console.log(err)
  });
    res.redirect('/');

};

var express = require('express');
var app = express();
var server = require('http').Server(app);
var mongoose = require('mongoose');
var bodyParser = require('body-parser');
var session = require('express-session');
var passportSocketIo = require("passport.socketio");
var cookieParser = require('cookie-parser');

global.MemoryStore = new session.MemoryStore();
global.io = require('socket.io')(server);
global.app = app;

server.listen(3000);

// Database connection
var db = mongoose.connection;
db.on('error', function(errorObject){
    console.log("DB Error: " + errorObject)
});
db.once('open', function callback () {
  console.log("database connection is open!")
});

mongoose.connect('mongodb://localhost/sc');

app.use(session({
    store: global.MemoryStore,
    secret: 'a_very_secret_secret', 
    resave: true,
    saveUninitialized: true,
    expires: new Date(Date.now() + 900000),
    httpOnly: true,
    key: 'connect.sid'
}));

global.io.use(passportSocketIo.authorize({
  cookieParser: cookieParser,
  key:         'connect.sid',       // the name of the cookie where express/connect stores its session_id
  secret:      'a_very_secret_secret',    // the session_secret to parse the cookie
  store:       global.MemoryStore,        // we NEED to use a sessionstore. no memorystore please
  success:     onAuthorizeSuccess,  // *optional* callback on success - read more below
  fail:        onAuthorizeFail,     // *optional* callback on fail/error - read more below
}));

function onAuthorizeSuccess(data, accept){
  console.log('successful connection to socket.io');
  accept();
}

function onAuthorizeFail(data, message, error, accept){
  if(error)
    throw new Error(message);
  console.log('failed connection to socket.io:', message);

  if(error)
    accept(new Error(message));
  // this error will be sent to the user as a special error-package
  // see: http://socket.io/docs/client-api/#socket > error-object
}


var path = require('path');
var swig = require('swig');
swig.setDefaults({ cache: false });

var snRoutes = require('./routes/sn');
var loginRoutes = require('./routes/login');

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: true
}));

app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.engine('html', swig.renderFile);
app.set('view engine', 'html');
app.set('views', __dirname + '/views');

function checkLoggedin(req, res, next) {
    if(req.isAuthenticated() || req.url === '/login' || req.url === '/forgot' || req.url.indexOf('/reset') == 0) {
        next();
    } else {
        if(req.url == '/register') {
            next()
        } else {
            res.redirect('/login');
        }
        return;
    }
    return;
/*
    next();
    return;
*/
}

app.use(checkLoggedin);

// Set routes
app.get('/', snRoutes.overview);
app.get('/add', snRoutes.add);
app.post('/add', snRoutes.addPost);
app.post('/update', snRoutes.update);
app.post('/update/rect', snRoutes.updateRect);
app.post('/update/size', snRoutes.updateSize);
app.get('/del/:id', snRoutes.del);
app.get('/login', loginRoutes.loginGet);
app.post('/login', loginRoutes.loginPost);
app.get('/register', loginRoutes.registerGet);
app.post('/register', loginRoutes.registerPost);
app.get('/logout', loginRoutes.logout);
app.get('/forgot', loginRoutes.forgotGet);
app.post('/forgot', loginRoutes.forgotPost);
app.get('/reset/:token', loginRoutes.resetGet);
app.post('/reset/:token', loginRoutes.resetPost);
//app.get('/reset/:username', loginRoutes.resetGet);

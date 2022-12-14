'use strict';

// For loading environment variables.
require('dotenv').config();

const express = require('express');                 // express routing
const expressSession = require('express-session');  // for managing session state
const passport = require('passport');               // handles authentication
const LocalStrategy = require('passport-local').Strategy; // username/password strategy
const app = express();
const port = process.env.PORT || 3000;
const router = require('./router.js');

/// NEW
const minicrypt = require('./miniCrypt');
const mc = new minicrypt();

// Session configuration

const session = {
    secret: process.env.SECRET || 'SECRET', // set this encryption key in Heroku config (never in GitHub)!
    resave: false,
    saveUninitialized: false
};

// Passport configuration

const strategy = new LocalStrategy(
    async (username, password, done) => {
        if (!await findUser(username, password)) {
            // no such user
            await new Promise((r) => setTimeout(r, 2000)); // two second delay
            return done(null, false, { 'message': 'Wrong username' });
        }
        if (!await validatePassword(username, password)) {
            // invalid password
            // should disable logins after N messages
            // delay return to rate-limit brute-force attacks
            await new Promise((r) => setTimeout(r, 2000)); // two second delay
            return done(null, false, { 'message': 'Wrong password' });
        } else {
            const data = await db.findOne({ Email: username });
            done(null, data);
        }
    });

// App configuration and database connection

const dbo = require('./conn.js');
let db;
dbo.connectToServer(function (err) {
    if (err) {
        console.error(err);
        console.log("--- EXITING ---");
        process.exit();
    } else {
        console.log("DB Connection Successful!");
    }
}).then(r => {
    db = dbo.getDb().db("Users").collection("User_Data");
});

app.use(expressSession(session));
passport.use(strategy);
app.use(passport.initialize());
app.use(passport.session());

// Convert user object to a unique identifier.
passport.serializeUser((user, done) => {
    done(null, user.userhash);
});
// Convert a unique identifier to a user object.
passport.deserializeUser(async (uid, done) => {
    db.findOne({ userhash: uid }).then(user => {
        done(null, user);
    });
});

app.use(express.json()); // allow JSON inputs
app.use(express.urlencoded({ 'extended': true })); // allow URLencoded data

// Returns true iff the user's userhash exists.
async function findUser(username, password) {
    const data = await db.findOne({ Email: username });
    return data === null ? false : true;
}

// Returns true iff the password is the one we have stored.
async function validatePassword(name, pwd) {
    if (!await findUser(name, pwd)) {
        return false;
    }
    const data = await db.findOne({ Email: name });
    if (mc.check(pwd, data.Password[0], data.Password[1])) {
        return true;
    }
    return false;
}

// Add a user to the database.
async function addUser(name, pwd) {

    const userhash = mc.hash(name + pwd)[1];

    const user = {
        userhash: userhash,
        Email: name,
        Password: mc.hash(pwd),
        Rooms_Created: 1,
        rooms: [{
            roomName: 'Living-Room-Sample',
            corners: '{"corner-1":"<div id=\\"draggable\\" class=\\"ui-widget-content corner-1\\"></div>","corner-2":"<div id=\\"draggable\\" class=\\"ui-widget-content corner-2\\"></div>","corner-3":"<div id=\\"draggable\\" class=\\"ui-widget-content corner-3\\"></div>","corner-4":"<div id=\\"draggable\\" class=\\"ui-widget-content corner-4\\"></div>"}',
            furniture: '{"image-draggable-container-1":"<div id=\\"image-draggable-container-1\\" class=\\"Three-Seat-Sofa-image-container draggable-furniture-container\\" style=\\"cursor: grab; top: 368px; left: 695px; height: 102px; width: 208px;\\"><img id=\\"Three-Seat-Sofa-image-draggable\\" class=\\"Three-Seat-Sofa-image draggable-furniture\\" src=\\"/assets/furniture-images/Three-Seat-Sofa.png\\"></div>","image-draggable-container-2":"<div id=\\"image-draggable-container-2\\" class=\\"TV-Stand-image-container draggable-furniture-container\\" style=\\"cursor: grab; top: 605px; left: 712px; width: 180px; height: 100px;\\"><img id=\\"TV-Stand-image-draggable\\" class=\\"TV-Stand-image draggable-furniture\\" src=\\"/assets/furniture-images/TV-Stand.png\\"></div>","image-draggable-container-3":"<div id=\\"image-draggable-container-3\\" class=\\"Fireplace-image-container draggable-furniture-container\\" style=\\"cursor: grab; top: 366px; left: 518px;\\"><img id=\\"Fireplace-image-draggable\\" class=\\"Fireplace-image draggable-furniture\\" src=\\"/assets/furniture-images/Fireplace.png\\"></div>","image-draggable-container-4":"<div id=\\"image-draggable-container-4\\" class=\\"Bookcase-image-container draggable-furniture-container\\" style=\\"cursor: grab; top: 367px; left: 1013px;\\"><img id=\\"Bookcase-image-draggable\\" class=\\"Bookcase-image draggable-furniture\\" src=\\"/assets/furniture-images/Bookcase.png\\"></div>","image-draggable-container-5":"<div id=\\"image-draggable-container-5\\" class=\\"Right-Opening-Door-image-container draggable-furniture-container\\" style=\\"cursor: grab; top: 655px; left: 983px; width: 122px; height: 112px;\\"><img id=\\"Right-Opening-Door-image-draggable\\" class=\\"Right-Opening-Door-image draggable-furniture\\" src=\\"/assets/furniture-images/Right-Opening-Door.png\\"></div>","image-draggable-container-6":"<div id=\\"image-draggable-container-6\\" class=\\"Rug-image-container draggable-furniture-container\\" style=\\"width: 251px; height: 137px; cursor: grab; top: 466px; left: 677px;\\"><img id=\\"Rug-image-draggable\\" class=\\"Rug-image draggable-furniture\\" src=\\"/assets/furniture-images/Rug.png\\"></div>"}'
        }]
    };

    db.insertOne(user, function (err, result) {
        if (err) {
            console.log("Error inserting entry");
            return false;
        } else {
            console.log("Successfully added a new entry");
        }
    });
    return true;
}

// Routes

function checkLoggedIn(req, res, next) {
    if (req.isAuthenticated()) {
        // If we are authenticated, run the next route.
        next();
    } else {
        // Otherwise, redirect to the login or guest room builder page.
        const page = req.url.split(".")[0];;
        if (page === '/guest-room-builder') {
            res.sendFile(__dirname + '/pages/html/guest-room-builder.html');
        } else {
            res.sendFile(__dirname + '/pages/html/home-notloggedin.html');
        }
    }
    return;
}

// Handle post data from the login.html form.
app.post('/login',
    passport.authenticate('local', {     // use username/password authentication
        'successRedirect': '/home',
        'failureRedirect': '/home-notloggedin.html'     
    }));

// Handle the URL /login (just output the login.html file).
app.get('/login',
    (req, res) => {
        res.redirect('/home');
    });

// Handle logging out (takes us back to the login page).
app.get('/logout', (req, res) => {
    req.logout(err => {
        if (err) {
            return next(err);
        }
        res.redirect('/home');
    });
});

app.post('/register',
    (req, res) => {
        const username = req.body['username'];
        const password = req.body['password'];
        let bool = false;
        addUser(username, password).then(r => bool = r);
        if (bool) {
            console.log("successfully registered!");
            res.redirect('/home');
        } else {
            console.log("failed to register");
        }
    });

app.get('/register',
    (req, res) => {
        res.redirect('/home');
    });

// app.use(express.static('html'));

app.get('/home', checkLoggedIn, (req, res) => {
    res.sendFile(__dirname + '/pages/html/home-loggedin.html');
});

app.get('/*.html', checkLoggedIn, (req, res) => {
    const page = req.url.split(".")[0];
    if (page === '/home-notloggedin' || page === '/home-loggedin' || page === '/profile' || page === '/room-builder' || page === '/my-rooms') {
        res.sendFile(__dirname + '/pages/html' + req.url);
    } else {
        res.redirect('/home');
    }
});

app.use('/', router);

app.get('/*', (req, res) => {
    res.redirect('/home');
});

app.listen(port, () => {
    console.log(`App now listening at http://localhost:${port}`);
});
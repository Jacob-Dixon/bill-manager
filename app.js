var express = require('express')

var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;

var cookieParser = require('cookie-parser');
var session = require('express-session');
var bodyParser = require('body-parser');

var Datastore = require('nedb');

var bcrypt = require('bcrypt-nodejs');

var _ = require('underscore');

var path = require('path');

// nodemailer addition
var nodemailer = require('nodemailer');
var messageType = "";
var userGlobal = "";
// creating SMTP transporter (i.e. login to external smtp server)
var transporter = nodemailer.createTransport({
	service: 'Gmail',
	auth:
	{
		user: 'cmbillmanager@gmail.com',
		pass: 'A11en411'
	}
});

//mail handling and options

//function parameters: (email,messageType,details) NOTE: "details" are things like the name of the bill, email is outbound email addr
var mailHandler = function(email,messageType,details) {
	if(messageType === "newUser") { //user welcome message
		var mailOptions = {
			from: 'cmbillmanager@gmail.com', //sender addr
			to: email, //receiver
			subject: 'Welcome to bill-manager ' + details + '!',
			text: 'Thank you for signing up for a bill-manager account!\n We are pleased to have you use our free bill splitting and managing app.\n\n if you have any questions or comments please reply to this email.\n\nbill-manager team :)'
			//html: ''
		};
	}
	else if(messageType === "newBill") { //user added a new bill
		var mailOptions = {
			from: 'cmbillmanager@gmail.com', //sender addr
			to: email, //receiver
			subject: 'You have added a new bill for ' + details,
			text: 'This is an automated message confirming that you have added a bill for ' + details + '.\nThank you,\n\nbill-manager team'
			//html: ''
		};
	}
	else if(messageType === "addedToBill") { //user got added to bill
		var mailOptions = {
			from: 'cmbillmanager@gmail.com', //sender addr
			to: email, //receiver
			subject: 'You have been added to a new bill for ' + details,
			text: 'This is an automated message letting you know that you have been added to a bill for ' + details + '.\nThank you,\n\nbill-manager team'
			//html: ''
		};
	}
	else if(messageType === "billChanged") { //bill user had was changed
		var mailOptions = {
			from: 'cmbillmanager@gmail.com', //sender addr
			to: email, //receiver
			subject: 'Bill' + details + ' was changed',
			text: 'This is an automated message letting you know that the ' + details + ' bill was modified.\nThank you,\n\nbill-manager team'
			//html: ''
		};
	}
	else if(messageType === "billDeleted") { //bill user was on got deleted
		var mailOptions = {
			from: 'cmbillmanager@gmail.com', //sender addr
			to: email, //receiver
			subject: 'Bill ' + details + ' was deleted',
			text: 'This is an automated message letting you know that the ' + details + ' bill was deleted.\nThank you,\n\nbill-manager team'
			//html: ''
		};
	}
	else { //this is an unknown state
		console.log('Error, unknown messageType: ' + messageType);
	}
	
	transporter.sendMail(mailOptions, function(error,info) { //send mail
		if(error) {
			console.log(error);
		}
		else{
			console.log('Message sent: ' + info.response);
		}
	});
	//debug send an email to me -- delete this at some point
	var mailOptions = {
		from: 'cmbillmanager@gmail.com', //sender addr
		to: 'jacob.dixon@okstate.edu', //receiver
		subject: 'Sent an email to ' + email,
		text: 'bill-manager sent an email to ' + email + ' for message type ' + messageType
		//html: ''
	};
	transporter.sendMail(mailOptions, function(error,info) {
		if(error) {
			console.log(error);
		}
		else{
			console.log('Message sent: ' + info.response);
		}
	});
}
		

app = express();

// Connect to databases
var prefix = process.env.OPENSHIFT_DATA_DIR || '';
var usersdb = new Datastore({filename: path.join(prefix, 'users.db')});
var groupsdb = new Datastore({filename: path.join(prefix, 'groups.db')});
var billsdb = new Datastore({filename: path.join(prefix, 'bills.db')});
usersdb.loadDatabase();
groupsdb.loadDatabase();
billsdb.loadDatabase();
usersdb.persistence.setAutocompactionInterval(60000);
groupsdb.persistence.setAutocompactionInterval(60000);
billsdb.persistence.setAutocompactionInterval(60000);

// Configure passport

passport.serializeUser(function(user, done) {
	// Persist just the user's id
	done(null, user._id);
});

passport.deserializeUser(function(id, done) {
	// Lookup user by id
	usersdb.find({_id: id}, function(err, docs) {
		done(null, docs[0]);
	});
});

passport.use(new LocalStrategy({
	usernameField: 'email',
	passwordField: 'password'
}, function(email, password, done) {

	usersdb.findOne({email: email}, function(err, user) {
		if (!user) done(null, false, {error: 'User does not exist'});
		// May have email in the system, but never registered for an account (no password):
		if (!user.phash) done(null, false, {error: 'User does not exist'});
		if (bcrypt.compareSync(password, user.phash)) {
			done(null, user);
		}
		done(null, false, {error: 'Incorrect password'});
		userGlobal = email;
	});

}));

// Stack middleware

// Standard express middleware for parsing the request data into req.body
app.use(bodyParser.urlencoded());
app.use(cookieParser());


// Configure sessions
app.use(session({
	secret: 'gfslieVZugRnpzkDWu1XkQwgf6iJVRpXwsMOsmBoi8t50e012C6k9cajNVt5zJT',
	resave: true,
	saveUninitialized: true
}));

// Install the passport middleware
app.use(passport.initialize()); 
app.use(passport.session());

// Routing middleware

// Log in to a user account
// request parameters: {user}
app.post('/login', passport.authenticate('local'), function(req, res, next) {
	res.send(req.user);
});

// Log out
app.get('/logout', function(req, res, next) {
	req.logout();
	res.redirect('/');
});

// Register a new user by email
// request parameters: {email, password, name}
app.post('/register', function(req, res, next) {
	usersdb.findOne({email: req.body.email}, function(err, user) {
		if (!user) {
			usersdb.insert({email: req.body.email, phash: bcrypt.hashSync(req.body.password), name: req.body.name});
			res.send("OK");
			userGlobal = req.body.email;
			mailHandler(userGlobal,'newUser',req.body.name); //send welcome e-mail
		} else if (!user.phash) {
			// Email already in system, but never registered
			usersdb.update({_id: user._id}, {email: req.body.email, phash: bcrypt.hashSync(req.body.password), name: req.body.name}, {}, function(err, ur) {
			res.send("OK");
			userGlobal = req.body.email;
			mailHandler(userGlobal,'newUser',req.body.name); //send welcome e-mail
		});
		} else {
			res.status(400).send("User already exists");
		}
	});
});

app.post('/registerTemp', function(req, res, next) {
	usersdb.findOne({email: req.body.email}, function(err, user) {
		if (!user) {
			usersdb.insert({email: req.body.email, name: req.body.email}, function(err, newUser) {
				res.send(newUser._id);
			});
			userGlobal = req.body.email;
			mailHandler(userGlobal,'newUser',req.body.name); //send welcome e-mail
		} else {
			res.status(400).send("User already exists");
		}
	});
})

// Halts the request passing through with a 401 if there is no user logged in
var auth = function(req, res, next) {
	if (req.user) {
		console.log("Authenticated request from ", req.user.email);
		return next();
	} else {
		res.status(401).send("Must login");
	}
};

// Get the current user
app.get('/login', auth, function(req, res, next) {
	res.send(req.user);
});

// Get up to 10 users whose name contains 'name'
app.get('/users/:name', auth, function(req, res, next) {
	usersdb.find({$where: function() {return this.name.indexOf(req.params.name) > -1}}).limit(10).exec(function(err, results) {
		res.send(results);
	});
});

// Make a user a member of a group
// request parameters: {userId, groupId}
app.post('/users/', auth, function(req, res, next) {
	groupsdb.update({_id: req.body.groupId}, {$addToSet: {members: req.body.userId}}, {}, function(err, ur) {
		res.send("OK");
	});
});

// Update a user
// request parameters: {id, update (object containing the same fields as POST to /register)}
app.put('/users/', auth, function(req, res, next) {

	usersdb.findOne({_id: req.body.id}, function(err, user) {
		var replacement = user;
		if (req.body.update.name) replacement.name = req.body.update.name;
		if (req.body.update.email) replacement.email = req.body.update.email;
		if (req.body.update.password) replacement.phash = bcrypt.hashSync(req.body.update.password);

		usersdb.update({_id: req.body.id}, replacement, {}, function(err, ur) {
			if (err) return res.status(500).send("Error updating user");
			res.send("OK");
		});
	});
});

// Returns groups for which the currently logged in user is a member
app.get('/groups', auth, function(req, res, next) {
	groupsdb.find({$where: function() {return _.contains(this.members, req.user._id)}}, function(err, groups) {
		if (err) return res.status(500).status("Database lookup error");
		res.send(groups);
	});
});


// Create a new group
// request parameters: {<group parameters>}
app.post('/groups', auth, function(req, res, next) {
	groupsdb.insert(req.body, function(err, nr) {
		if (err) return res.status(500).send("Error adding group");
		res.send("OK");
		mailHandler(userGlobal,'newGroup',req.body); //send email for creating a new group
	});
});

// Update a group
// request parameters: {id, newGroup}
app.put('/groups', auth, function(req, res, next) {
	groupsdb.update({_id: req.body.id}, req.body.newGroup, {}, function(err, ur) {
		if (err) return res.status(500).send("Error updating group");
		res.send("OK");
	});
});

// Delete a group
// request parameters: {id}
app.delete('/groups', auth, function(req, res, next) {
	groupsdb.remove({_id: req.body.id}, {}, function(err, nr) {
		if (err) return res.status(500).send("Error deleting group");
		res.send("OK");
	});
});

// Get the bills associated with the group of id 'groupId'
app.get('/bills/:groupId', auth, function(req, res, next) {
	billsdb.find({owner: req.params.groupId}).sort({date: -1}).exec(function(err, bills) {
		res.send(bills);
	});
});

// Create a new bill
// request parameters: {<bill parameters>}
app.post('/bills', auth, function(req, res, next) {
	billsdb.insert(req.body);
	//if (err) return res.status(500).send("Error creating new bill");
	res.send("OK");
	mailHandler(userGlobal,'newBill',req.body); //send email new bill created
});

// Update a bill
// request parameters: {id, replacement}
app.put('/bills', auth, function(req, res, next) {
	billsdb.update({_id: req.body.id}, req.body.replacement, {}, function(err, ur) {
		if (err) return res.status(500).send("Error updating bill");
		res.send("OK");
		mailHandler(userGlobal,'billChanged',req.body); //send email when bill is changed
	});
})

// Delete a bill
// request parameters: {id}
app.delete('/bills', auth, function(req, res, next) {
	billsdb.remove({_id: req.body.id}, {}, function(err, nr) {
		if (err) return res.status(500).send("Error deleting bill");
		res.send("OK");
		mailHandler(userGlobal,'billDeleted',req.body); //send email when bill is deleted
	});
});

// Get the users that are responsible for paying the bill with id 'billId'
app.get('/payers/:billId', auth, function(req, res, next) {
	billsdb.find({_id: req.params.billId}, function(err, bills) {
		usersdb.find({_id: {$in: bills[0].payers}}, function(err, users) {
			res.send(users);
		});
	});
});

// Get the members of the group with id 'groupId'
app.get('/members/:groupId', auth, function(req, res, next) {
	groupsdb.find({_id: req.params.groupId}, function(err, groups) {
		if (!groups[0]) {
			res.status(500).send("Error retrieving group members");
			return;
		}
		usersdb.find({_id: {$in: groups[0].members}}, function(err, users) {
			res.send(users);
		});
	});
});


// Finally, serve static files from the 'static' directory
app.use(express.static('static'));

var serverPort = process.env.OPENSHIFT_NODEJS_PORT || 8000;
var serverIPAddress = process.env.OPENSHIFT_NODEJS_IP || '127.0.0.1';

// Launch the app
app.listen(serverPort, serverIPAddress, function() {
	console.log('Server running');
});
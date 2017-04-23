var mongoose = require('mongoose');
var Schema = mongoose.Schema,
    ObjectId = Schema.ObjectId
    
var snSchema = new Schema({
    title: String,
    content: String,
    date: { type: Date, default: Date.now },
    visible: { type: Boolean, default: true },
    rect: {
        x: { type: Number, required: true },
        y: { type: Number, required: true },
        width: { type: Number, required: true },
        height: { type: Number, required: true }
    },
    userId: { type: ObjectId, ref: 'users', required: true },
    category: { type: Number, required: true }
});

var StickyNote = mongoose.model('StickyNotes', snSchema);

exports.overview = function(req, res){
/*
    StickyNote.find({ visible: true, userId: req.user._id }, function(err, notes){
        res.render('index', { notes: notes, categories: req.user.categories });
    });
*/
    res.render('index', { categoryProxy: req.user.categoryProxy, categories: req.user.categories, activeTab: req.user.activeTab });
};

exports.add = function(req, res){

    console.log("(add) Adding new sticky note to user:")
    console.log(req.user)

    var note = new StickyNote({ title: "", content: "", userId: req.user._id, category: cat });
    note.save();
    global.io.of('/sn').emit('NewStickyNote', { note: note });
    res.send({ status: "ok" });
};

exports.addPost = function(req, res){
    console.log("(addPost) Adding new sticky note to user:")
    console.log(req.user)

    if(req.body.category) {
        var note = new StickyNote({ title: "", content: "", userId: req.user._id, category: req.body.category });
        note.rect.x = 30;
        note.rect.y = 30;
        note.rect.width = 200;
        note.rect.height = 75;
        note.save();

        // This emit won't work. It will send the new note to _everyone_. Not quite OK.
        // It should emit to the user who requested it.
        // ... so TODO. Only send it to the user who created this note.
        // This is only omportant when the API is being used. This isn't an issue if sockets are being used.
//        global.io.of('/sn').emit('NewStickyNote', { note: note });
        res.send({ status: "ok" });
    } else {
        res.status(500).send("No category provided.")
    }
};

exports.update = function(req, res){
    if(req.body.id) {
        StickyNote.findOne({_id: req.body.id}, function(err, n){
            if(n) {
                n.content = req.body.content;
                n.save(function(err){
                    if(!err) {
                        res.send({ status: "ok" });
                        global.io.of('/sn').emit('UpdateStickyNote', n);
                    } else {
                        res.status(500).send(err)
                    }
                });
            } else {
                res.status(500).send("Unable to save. Perhaps an invalid key?")
            }
        });
    }
};

exports.updateRect = function(req, res){
    if(req.body.id) {
        StickyNote.findOne({_id: req.body.id}, function(err, n){
            if(n) {
                n.rect.x = parseInt(req.body.x);
                n.rect.y = parseInt(req.body.y);
                n.save();
        		global.io.of('/sn').emit('UpdateStickyPosition', { id: req.body.id, rect: n.rect });
            }
        });
    }
    res.send({ status: "ok" });
};

exports.updateSize = function(req, res){
    if(req.body.id) {
        StickyNote.findOne({_id: req.body.id}, function(err, n){
            if(n) {
                n.rect.width = parseInt(req.body.width);
                n.rect.height = parseInt(req.body.height);
                n.save();
		        global.io.of('/sn').emit('UpdateStickySize', { id: req.body.id, rect: n.rect });
            }
        });
    }
    res.send({ status: "ok" });
};

exports.del = function(req, res){
    if(req.params.id) {
        StickyNote.findOne({_id: req.params.id}, function(err, n){
            if(n) {
                n.visible = false;
                n.save();
                global.io.of('/sn').emit('RemovedStickyNote', { id: req.params.id });
            }
        });
    }
    res.send({ status: "ok" });
    /*
    if(req.params.id) {
        var id = req.params.id
        
        StickyNote.remove({ _id: id }, function(err){
            if(!err) {
                res.send({status: "ok"});
                global.io.of('/sn').emit('RemovedStickyNote', { id: id });
            } else {
                res.send({status: "failed removing entry.", data: err});
            }
        });
        
    } else {
        res.send({status: "failed removing sticky note"});
    }
    */
};

global.io.of('/sn').on('connection', function (socket) {
    console.log("Client connected!")

    socket.on('NotesForCategory', function (data) {
        StickyNote.find({ visible: data.visible, category: data.category, userId: socket.request.user._id }, function(err, notes){
            socket.emit('NotesForCategory', {category: data.category, notes: notes})
        });
    });
    socket.on('UpdateActiveTab', function (data) {
        if(data.activeTab != socket.request.user.activeTab) {
            socket.request.user.activeTab = data.activeTab;
            socket.request.user.save();
        }
    });
    socket.on('NewTabRequest', function (data) {
        console.log(data)
        if(data.name && data.name != '') {
            socket.request.user.categories.push(data.name);
            socket.request.user.categoryProxy.push(socket.request.user.categories.length-1);
            socket.request.user.save();
            socket.emit('NewTabResponse', {id: socket.request.user.categories.length-1, name: data.name});
        }
    });
    socket.on('UpdateCategoryProxy', function (data) {
        var currentCatLength = socket.request.user.categories.length;
        var newCatLength = data.categories.length;

        // I should really do some validation here. This is direct user input that i'm just blindly accepting. Ok.. the database forces it to be numbers, but still.
        socket.request.user.categoryProxy = data.categories;
        socket.request.user.save();
    });
    // This socket action is being broadcasted to all other sockets except for the sender.
    socket.on('UpdateStickyNote', function (data) {
        if(data.id && data.content) {
            StickyNote.findOne({_id: data.id, userId: socket.request.user._id}, function(err, n){
                if(n) {
                    n.content = data.content;
                    n.save(function(err){
                        if(!err) {
                            socket.broadcast.emit('UpdateStickyNote', n);
                            socket.emit('UpdateStickyNoteVerify', {id : n._id.toString()});
                        }
                    });
                }
            });
        }
    });

    // This socket action is being broadcasted to all other sockets except for the sender.
    socket.on('UpdateStickyPosition', function (data) {
        if(data.id && data.x && data.y) {
            StickyNote.findOne({_id: data.id, userId: socket.request.user._id}, function(err, n){
                if(n) {
                    n.rect.x = data.x;
                    n.rect.y = data.y;
                    n.save(function(err){
                        if(!err) {
                            socket.broadcast.emit('UpdateStickyPosition', data);
                            socket.emit('UpdateStickyPositionVerify', {id : n._id.toString()});
                        }
                    });
                }
            });
        }
    });

    // This socket action is being broadcasted to all other sockets except for the sender.
    socket.on('NewStickyNote', function (data) {
        if(data.category >= 0) {

            var n = new StickyNote({ title: "", content: "", userId: socket.request.user._id, category: data.category });
            n.rect.x = 30;
            n.rect.y = 30;
            n.rect.width = 200;
            n.rect.height = 75;
            n.save(function(err) {
                if(!err) {
                    socket.emit('NewStickyNoteVerify', {note : n});
                } else {
                    console.log(err)
                }
            });
        }
    });


    // Update tab name
    socket.on("UpdateTabName", function (data) {
        socket.request.user.categories[data.id] = data.name;
        socket.request.user.markModified('categories');
        socket.request.user.save();
    });

    // Remove tab
    socket.on("RemoveTab", function (data) {
        var index = socket.request.user.categoryProxy.indexOf(data.tabId);

        if(index != -1) {
            socket.request.user.categoryProxy.splice(index, 1);
            socket.request.user.markModified('categoryProxy');
            socket.request.user.save();

        }
    });


});

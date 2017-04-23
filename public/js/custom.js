jQuery.fn.selectText = function(){
   var doc = document;
   var element = this[0];
   if (doc.body.createTextRange) {
       var range = document.body.createTextRange();
       range.moveToElementText(element);
       range.select();
   } else if (window.getSelection) {
       var selection = window.getSelection();        
       var range = document.createRange();
       range.selectNodeContents(element);
       selection.removeAllRanges();
       selection.addRange(range);
   }
};

//var editors = {}
var activeCategory = 0;
var nodesLoaded = [];
var socket = io.connect('/sn');
var addTabDialog;
var potentiallyChangedNotes = []

setInterval(function () { autosaveChangedNotes() }, 5000);

function getCookie(cname) {
    var name = cname + "=";
    var ca = document.cookie.split(';');
    for(var i=0; i<ca.length; i++) {
        var c = ca[i];
        while (c.charAt(0)==' ') c = c.substring(1);
        if (c.indexOf(name) != -1) return c.substring(name.length,c.length);
    }
    return "";
}

function del(id) {
    
    var r = confirm("Are you sure you want to delete this note?");
    if (r == true) {
        $.ajax({
            url: "/del/"+id,
        }).done(function(data) {
            
        });
    }
}

function share(id) {
    alert("STUB! This is going to be functionality to share a note with someone else. It's not implemented yet!");
}

function changeCategory(id) {
    alert("STUB! This is going to be functionality to change the category of this note. To be implemented!");
}

function updateNotePosition(id, x, y) {
    console.log("Updating node position.")
    if(socket.connected) {
        socket.emit("UpdateStickyPosition", {id: id, x: x, y: y});
    }
}

function updateNoteSize(id, width, height) {
// TODO: do this using a socket call.
    $.post( "/update/size", {id: id, width: width, height: height}, function(data) {
        // ...
    }).done(function(data) {
//        sendUserFeedback(id, "New note size saved.", 1000);
    }).fail(function() {
        alert( "error" );
    });
}

function addNewStickyNote() {

    console.log("Updating new note.")
    if(socket.connected) {
        socket.emit("NewStickyNote", {category: activeCategory});
    }

/*
// TODO: do this using a socket call.
    $.post( "/add", {category: activeCategory}, function(data) {
        // ...
    }).done(function(data) {
        // ...
    }).fail(function() {
        alert( "error" );
    });
*/
}

function updateNoteContent(id, content) {
    if(socket.connected) {
        socket.emit("UpdateStickyNote", {id: id, content: content});
    }
}

function changeActiveTab(tabId) {
    activeCategory = parseInt(tabId);

    // Get the current active tab and hide it.
    $('.notes.active[data-content]').removeClass('active');
    $('#tabButtons a.active[data-tab]').removeClass('active');

    // Now show the new active tab.
    $('.notes[data-content='+activeCategory+']').addClass('active');
    $('#tabButtons a[data-tab='+activeCategory+']').addClass('active');

    loadNotesIfNotLoaded(activeCategory);
    
    // Update the active category
    // Todo: this function is called on page load and on tab change. Not a big issue, but it doesn't have to be called on page load.
    // On the server we just update the value if it differes from the current known value.
    if(socket.connected) {
        socket.emit("UpdateActiveTab", { activeTab: activeCategory });
    }
}

function loadNotesIfNotLoaded(noteCategory) {
    if(!nodesLoaded[noteCategory]) {
        // It isn't loaded at _this_ point but will start loading right after.
        nodesLoaded[noteCategory] = true;

        if(socket.connected) {
            socket.emit("NotesForCategory", { visible: true, category: noteCategory });
        }
    }
}

function contentChanged(id) {
    if(!potentiallyChangedNotes[id]) {
        potentiallyChangedNotes[id] = true;
        $("#"+id+" .autosave").fadeTo("slow", 1.0);
        console.log("contentChanged: " + id)
    }
}

function autosaveChangedNotes() {
    for(id in potentiallyChangedNotes) {
        var elem = document.getElementById(id).getElementsByClassName("context")[0]
        if(elem) {
// TODO: We should be "slightly" more intelligent. Right now we're just bluntly saving changes. Even if we - for example - add a space and delete it again.
// How to do this intelligently.. i don't know yet. Perhaps create a hash of the innetHTML and compare that?
            updateNoteContent(id, elem.innerHTML);
        }
    }

    // Resets the array since we're done with the current elements now.
    potentiallyChangedNotes = []
}

function addNoteToDom(note) {
    var htmlData = document.getElementById('noteTemplate').outerHTML
    var idString = note._id.toString();

    htmlData = htmlData.replace(/noteTemplate/g, idString);
    htmlData = htmlData.replace(/__CONTENT__/g, note.content);
    htmlData = htmlData.replace(/__ID__/g, idString);
    $(htmlData).appendTo('[data-content='+note.category+']').addClass('draggable').css({
        width: note.rect.width,
        height: note.rect.height,
        top: note.rect.y,
        left: note.rect.x
    }).fadeIn();

    // Add an event listener to get notified when we change the content.
    var elem = document.getElementById(idString).getElementsByClassName("context")[0]
    elem.addEventListener("input", function(){ contentChanged(idString); }, false);

    $("#"+note._id.toString()+" .delete").on("click", function(e){ del(idString) });
    $("#"+note._id.toString()+" .share").on("click", function(e){ share(idString) });
    $("#"+note._id.toString()+" .changeCategory").on("click", function(e){ changeCategory(idString) });

    makeDragResizable(document.getElementById(idString));
}

$(document).ready(function(){
    
    var socket = io.connect('/sn', {
        query: 'session_id=' + getCookie('connect.sid')
    });
    socket.on('NewStickyNote', function (data) {
        addNoteToDom(data.note);
    });
    
    socket.on('UpdateStickyNote', function (data) {
    	console.log("Update note data")
        var elem = document.getElementById(data._id.toString()).getElementsByClassName("context")[0]
        if(elem) {
            elem.innerHTML = data.content;
            // You only see this line if the note content has been changed by someone else.
            //sendUserFeedback(data._id.toString(), "Note content updated (change made by someone else).", 1000);
        }
    });

    // The server lets the sender know that a note change has really been processed.
    socket.on('UpdateStickyNoteVerify', function (data) {
        $("#"+data.id+" .autosave").fadeTo("slow", 0.1);
//        sendUserFeedback(data.id, "Your change has been saved.", 1000);
    });

    // New notes will flow in via this call.
    socket.on('NewStickyNoteVerify', function (data) {
        addNoteToDom(data.note);
    });

    socket.on('UpdateStickyPosition', function (data) {
	    $("#"+data.id.toString()).animate({ left: data.x+"px", top: data.y+"px" });
    });

    socket.on('UpdateStickySize', function (data) {
	    $("#"+data.id.toString()).animate({ width: data.rect.width+"px", height: data.rect.height+"px"  });
    });
    
    socket.on('RemovedStickyNote', function (data) {
        $("#"+data.id.toString()).fadeOut( function() { $(this).remove(); });
    });

    socket.on('NotesForCategory', function (data) {
        data.notes.forEach(addNoteToDom);
    });

    socket.on('connect', function (data) {
        var activeTab = $(".tabs[data-active-tab]").attr("data-active-tab")
        changeActiveTab(activeTab);
    });

    socket.on('NewTabResponse', function (data) {
        var newTab = $('.tab[data-tab]:last').clone();
        newTab.attr('data-tab', data.id).text(data.name).removeClass('active')
        .on('click', function (e) {
            changeActiveTab($(this).attr('data-tab'));
            e.preventDefault();
        });

        $('.tab[data-tab]:last').after(newTab);
    });

    $('[data-tab]').on('click', function (e) {
        changeActiveTab($(this).attr('data-tab'));
        e.preventDefault();
    });

    $('#newActions .button.addtab').on('click', function (e) {
        addTabDialog.dialog( "open" );
        e.preventDefault();
    });

    $('#newActions .button.addnote').on('click', function (e) {
        addNewStickyNote();
        e.preventDefault();
    });

    $( "#tabButtons" ).sortable({
        stop: function( event, ui ) {
            var newProxy = []
            $('a', this).each(function(index){
                newProxy.push(parseInt($(this).attr('data-tab')));
            });

            if(socket.connected) {
                socket.emit("UpdateCategoryProxy", { categories: newProxy });
            }

            // newProxy should go to the socket and save the new proxy places in mongo.
        }
    });
//    $( "#tabButtons" ).disableSelection();
    
    $("#tabButtons a").dblclick(function(){
        console.log("Double clicked...." + $(this).html())
        $(this).attr("contentEditable", true);
        $("#tabButtons").sortable('disable');
        $(this).selectText();

        // Focus fix for Firefox. Chrome works fine without this line.
        $(this).focus();

        $(this).focusout(function(){
            $("#tabButtons").sortable('enable');
            $(this).removeAttr("contentEditable");

            if(socket.connected) {
                socket.emit("UpdateTabName", {id: parseInt($(this).attr('data-tab')), name: $(this).text()});
            }

//            console.log($(this).attr('data-tab') + " -- " + $(this).html())
        });
    });


    addTabDialog = $( "#dialog-form" ).dialog({
      autoOpen: false,
      height: 300,
      width: 350,
      modal: true,
      buttons: {
        "Create tab": function(){
            var newTabName = $('#tabName').val()
            
            if(socket.connected) {
                socket.emit("NewTabRequest", { name: newTabName });
            }

            addTabDialog.dialog( "close" );
        },
        Cancel: function() {
          addTabDialog.dialog( "close" );
        }
      },
      close: function() {
      }
    });

    addTabDialog.find( "form" ).on( "submit", function( event ) {
      // TODO: This should also request a new tab page using the sccket.... Right now it's not doing that.
      event.preventDefault();
    });

    $('#styleActions a').click(function(e) {
      switch($(this).data('role')) {
        case 'h1':
        case 'h2':
        case 'p':
          document.execCommand('formatBlock', false, $(this).data('role'));
          break;
        default:
          document.execCommand($(this).data('role'), false, null);
          break;
        }
    })

    $("#tabButtons a i").on("click", function(e){
        var r = confirm("Are you sure you want to delete the tab named: \"" + $(this).parent().text().trim() + "\"?");
        if (r == true) {
            var tabId = $(this).attr('data-tab');
            $(this).parent().fadeOut("normal", function(){ $(this).remove(); });

            // Send tab deletion request to the socket. Just delete it on the client side and "assume" it went OK on the server side. No need to wait for a response.
            if(socket.connected) {
                socket.emit("RemoveTab", { tabId: tabId });
            }
        }
    });

    // Firefox doesn't support WYSIWYG keys yet. Some default keys are being catched below to make this work under firefox as well.
    $(window).bind('keydown', function(event) {
        if (event.ctrlKey || event.metaKey) {
            switch (String.fromCharCode(event.which).toLowerCase()) {
            case 'b':
                event.preventDefault();
                document.execCommand('bold', false, null);
                break;
            case 'u':
                event.preventDefault();
                document.execCommand('underline', false, null);
                break;
            case 'i':
                event.preventDefault();
                document.execCommand('italic', false, null);
                break;
            }
        }
    });

});

function makeDragResizable(obj) {
    $(obj).resizable({
        start: function( event, ui ) {
            $("#fullscreenDragOverlay").css( "zIndex", 10000 ).css("cursor", $(event.toElement).css("cursor")).show();
        },
        stop: function( event, ui ) {
            updateNoteSize(this.id, $(this).width(), $(this).height()) // +20's are for padding. Change if you change the padding.
            $("#fullscreenDragOverlay").css( "zIndex", -1 ).hide();
        }

    }).draggable({
        stack: ".notes.active div",
        cancel: ".context",
        containment: "window",
        start: function( event, ui ) {
            $("#fullscreenDragOverlay").css( "zIndex", 10000 ).css("cursor", "move").show();
        },
        stop: function( event, ui ) {
            updateNotePosition(this.id, ui.position.left, ui.position.top)
            $("#fullscreenDragOverlay").css( "zIndex", -1 ).hide();
        }
    });
}

'use strict';

const express = require('express');
const socketIO = require('socket.io');
const path = require('path');
var constants = require('./constants');
var control = require('./control');

const PORT = process.env.PORT || 80;
const INDEX = path.join(__dirname, 'public');

const server = express()
  .use(express.static(INDEX))
  .listen(PORT, () => console.log(`Listening on ${ PORT }`));

const io = socketIO(server);

global.discEndpointSockets = [];

var adEndpointSockets = [];

var requestingConnection = [];
var request = [];

var acceptingConnection = [];

var connected = [];

var uiSocket;

(function(){
  var oldLog = console.log;
  console.log = function (message) {
      // DO MESSAGE HERE.
      if(uiSocket != undefined){
        var str = arguments[0]
        for (var i=1; i<arguments.length; i++){
          str+= " " + arguments[i]
        }
        uiSocket.emit(constants.NEW_MESSAGE, {username : "Console.log", message : str})
      }
      oldLog.apply(console, arguments);
  };
})();

// Chatroom

io.on('connection', function (socket) {
  var addedUser = false;
  
  console.log("new Connection", socket.handshake.headers['user-agent'])

  //when the client emits 'advertise', we add it to the list and we send the list to all clients who requested discovery
  socket.on(constants.ADVERTISE, function (info) {
    console.log('new user is advertising:',info[constants.ENDPOINT_NAME]);
    info[constants.ENDPOINT_ID] = info[constants.ENDPOINT_NAME].replace(" ","_") + "_1";
    socket[constants.ADVERTISE] = info
    adEndpointSockets.push(socket)

    for(var i in global.discEndpointSockets){//Send this Endpoint to the endpoints that are discovering.
        if(global.discEndpointSockets[i] != socket){
          global.discEndpointSockets[i].emit(constants.ON_ENDPOINT_FOUND, socket[constants.ADVERTISE]);
        }
    }
  });
    
  //when the client emits 'discovery', we send to him the list of client
  socket.on(constants.DISCOVER, function (info) {
    console.log('new endpoint is discovering:',info[constants.SERVICE_ID]);
    socket[constants.DISCOVER] = info
    global.discEndpointSockets.push(socket)

    for (var i in adEndpointSockets){
      if (adEndpointSockets[i]!=socket){
        socket.emit(constants.ON_ENDPOINT_FOUND,adEndpointSockets[i][constants.ADVERTISE])
      }
    }
  });

  socket.on(constants.STOP_DISCOVERY, function (info) {
    console.log('endpoint:',id(socket),'is stopping discovering');
    global.discEndpointSockets.splice(global.discEndpointSockets.indexOf(socket),1);
    console.log('global.discEndpointSockets.length', global.discEndpointSockets.length)
  });
  
  socket.on(constants.STOP_ADVERTISING, function (info) {
    console.log('endpoint:',id(socket),'is stopping advertising');
    adEndpointSockets.splice(adEndpointSockets.indexOf(socket),1);
    console.log('adEndpointSockets.length', adEndpointSockets.length)
  });

  //when the client emits REQUEST_CONNECTION, we send the request to the other node
  socket.on(constants.REQUEST_CONNECTION, function (info) {
    if (id(socket) == "") return
    console.log(id(socket),'is requesting connection with',info[constants.ENDPOINT_ID] );
    
    for (var i in adEndpointSockets){
      if (id(adEndpointSockets[i]) == info[constants.ENDPOINT_ID]){
        console.log("found, in progress for : ",id(socket),id(adEndpointSockets[i]))
        if (requestingConnection.indexOf(socket) == -1){
          requestingConnection.push(socket)
        }
        if (requestingConnection.indexOf(adEndpointSockets[i]) == -1){
          requestingConnection.push(adEndpointSockets[i])
        }
        socket[constants.ADVERTISE][constants.AUTH] = "0000"
        adEndpointSockets[i][constants.ADVERTISE][constants.AUTH] = "0000"
        adEndpointSockets[i].emit(constants.ON_CONNECTION_INITIATED,socket[constants.ADVERTISE])
        socket.emit(constants.ON_CONNECTION_INITIATED,adEndpointSockets[i][constants.ADVERTISE])
        

      }
    }
  });

  socket.on(constants.ACCEPT_CONNECTION, function (info) {
    console.log(id(socket),'is accepting connection with',info[constants.ENDPOINT_ID] );
    if (getGroup(connected,id(socket)).length){//Check if this endpoint is already connected?
      console.log("endpoint",id(socket),"is already connected");
      return;
    }
    console.log('first accepting', connected.length)
    var tmp = requestingConnection.slice();
    var requestingEndpoint;
    for (var i in tmp){
      if (id(tmp[i]) == info[constants.ENDPOINT_ID]){
        console.log('connection is accepted')
        requestingEndpoint = tmp[i];
        requestingConnection.splice(i,1);
        tmp[i].emit(constants.ON_CONNECTION_RESULT,{[constants.STATE]:true,
            [constants.ENDPOINT_ID] : id(socket)})
        socket.emit(constants.ON_CONNECTION_RESULT,{[constants.STATE]:true,
            [constants.ENDPOINT_ID] : id(tmp[i])})
      }
    }
    connected.push([requestingEndpoint,socket]);
  });

  socket.on(constants.SEND_PAYLOAD, function (info) {
    console.log(id(socket),'is sending payload ',info[constants.PAYLOAD],'to',info[constants.ENDPOINT_ID] );

    var group = getGroup(connected,id(socket))
    for (var i in group){
      if (id(group[i]) == info[constants.ENDPOINT_ID]){
        group[i].emit(constants.ON_PAYLOAD_RECEIVED,info)
        group[i].emit(constants.ON_PAYLOAD_TRANSFER_UPDATE,info)
        socket.emit(constants.ON_PAYLOAD_TRANSFER_UPDATE,info)
      }
    }
  });
  
  socket.on(constants.PAYLOAD_RECEIVED, function (info) {
    console.log(id(socket),'has received the payload');

    var group = getGroup(connected,id(socket))
    for (var i in group){
      if (id(group[i]) == info[constants.ENDPOINT_ID]){
        group[i].emit(constants.ON_PAYLOAD_TRANSFER_UPDATE,info)
        socket.emit(constants.ON_PAYLOAD_TRANSFER_UPDATE,info)
      }
    }
  });

  // when the user disconnects.. perform this
  socket.on(constants.DISCONNECTING, function () {
    console.log('a device is asking to disconnect');

    var group = getGroup(connected,id(socket))

    if (group.length){//remove from connected table
      console.log(connected.length);
      connected.splice(connected.indexOf(group),1);
      console.log(connected.length)
      for(var j=0;j<group.length;j++){
        if ( group[j] != socket){
          console.log('sending disconnect to',group[j][constants.ADVERTISE][constants.ENDPOINT_ID],'from :', socket[constants.ADVERTISE][constants.ENDPOINT_ID]);
          group[j].emit(constants.ON_DISCONNECTED, { //send the list of advertising users to the list of discovery
            endpointId : socket[constants.ADVERTISE][constants.ENDPOINT_ID]
          });
        }
      }
    }else{
      console.log('is not connected, but requested disconnection');
      console.log(connected.length);
    }  
    if (global.discEndpointSockets.includes(socket)){//remove from the discovery table
      global.discEndpointSockets.splice(global.discEndpointSockets.indexOf(socket),1);
    }
    if (adEndpointSockets.includes(socket)){//remove from the discovery table
      adEndpointSockets.splice(adEndpointSockets.indexOf(socket),1);
    }
  });
  // when the user disconnects.. perform this
  socket.on(constants.DISCONNECT, function (data) {
    console.log('Nearby Bridge lost connection with the device',data);
  });
  // when the device disconnects.. perform this
  socket.on(constants.DISCONNECT, function () {
    console.log('device is disconnected from Nearby Bridge Server');
  });

  // when the device disconnects.. perform this
  socket.on(constants.NEW_MESSAGE, function (message) {
    console.log(constants.NEW_MESSAGE, message);
    control.parse(message,socket);
  });
  
  socket.on('Ui', function (message) {
    uiSocket = socket;
    console.log('Ui dashboard');
    socket.emit('login',{numUsers:discEndpointSockets.length});
  });


});

function id(endpoint){
  var id = ""
  if (endpoint[constants.ADVERTISE] && endpoint[constants.ADVERTISE][constants.ENDPOINT_ID])
    id = endpoint[constants.ADVERTISE][constants.ENDPOINT_ID]
  else console.log("Id was not found for",endpoint)
  return id
}

global.disconnect = function(){
  for(var i in connected){
    var group = connected[i]
    for (var j in group){
      var socket = j==0 ? group[1]:group[0]; 
      console.log('sending disconnect to',group[j][constants.ADVERTISE][constants.ENDPOINT_ID]);
      group[j].emit(constants.ON_DISCONNECTED, { //send the list of advertising users to the list of discovery
          endpointId : socket[constants.ADVERTISE][constants.ENDPOINT_ID]
      });
    }
  }
  connected = [];
}

function getGroup(table,endpointId){
  for (var i in table){
    var group = table[i];
    for (var j in group){
      if (id(group[j]) ==endpointId){
        return group;
      }
    }
  }
  return [];
}
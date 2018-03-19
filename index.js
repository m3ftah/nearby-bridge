'use strict';

const express = require('express');
const socketIO = require('socket.io');
const path = require('path');

var constants = require('./constants');

const PORT = process.env.PORT || 3000;
const INDEX = path.join(__dirname, 'public');

const server = express()
  .use((req, res) => res.sendFile(INDEX) )
  .listen(PORT, () => console.log(`Listening on ${ PORT }`));

const io = socketIO(server);

io.on('connection', (socket) => {
  console.log('Client connected');
  socket.on('disconnect', () => console.log('Client disconnected'));
});

setInterval(() => io.emit('time', new Date().toTimeString()), 1000);


var discEndpointSockets = [];

var adEndpointSockets = [];

var requestingConnection = [];
var request = [];

var acceptingConnection = [];

var connected = [];



// Chatroom

io.on('connection', function (socket) {
  var addedUser = false;
  
  console.log("new Connection")
  // when the client emits 'new message', this listens and executes
  socket.on('new message', function (data) {
    // we tell the client to execute 'new message'
    console.log('new message');
    socket.broadcast.emit('new message', {
      username: socket.endpointId,
      message: data
    });
  });

  //when the client emits 'advertise', we add it to the list and we send the list to all clients who requested discovery
  socket.on(constants.ADVERTISE, function (info) {
    console.log('new user is advertising')
    console.log('new user is advertising:',info[constants.ENDPOINT_NAME]);
    info[constants.ENDPOINT_ID] = info[constants.ENDPOINT_NAME].replace(" ","_") + "_1";
    socket[constants.ADVERTISE] = info
    adEndpointSockets.push(socket)

    for(var i in discEndpointSockets){//Send this Endpoint to the endpoints that are discovering.
        if(discEndpointSockets[i] != socket){
          discEndpointSockets[i].emit(constants.ON_ENDPOINT_FOUND, socket[constants.ADVERTISE]);
        }
    }
  });
    
  //when the client emits 'discovery', we send to him the list of client
  socket.on(constants.DISCOVER, function (info) {
    console.log('new endpoint is discovering:',info[constants.SERVICE_ID]);
    socket[constants.DISCOVER] = info
    discEndpointSockets.push(socket)

    for (var i in adEndpointSockets){
      if (adEndpointSockets[i]!=socket){
        socket.emit(constants.ON_ENDPOINT_FOUND,adEndpointSockets[i][constants.ADVERTISE])
      }
    }
  });

  socket.on(constants.STOP_DISCOVERY, function (info) {
    console.log('endpoint:',id(socket),'is stopping discovering');
    discEndpointSockets.splice(discEndpointSockets.indexOf(socket));
    console.log('discEndpointSockets', discEndpointSockets)
  });
  
  socket.on(constants.STOP_ADVERTISING, function (info) {
    console.log('endpoint:',id(socket),'is stopping advertising');
    adEndpointSockets.splice(adEndpointSockets.indexOf(socket));
    console.log('adEndpointSockets', adEndpointSockets)
  });

  //when the client emits REQUEST_CONNECTION, we send the request to the other node
  socket.on(constants.REQUEST_CONNECTION, function (info) {
    console.log(id(socket),'is requesting connection with',info[constants.ENDPOINT_ID] );
    
    for (var i in adEndpointSockets){      
      if (id(adEndpointSockets[i]) == info[constants.ENDPOINT_ID]){

        requestingConnection.push(socket)
        socket[constants.ADVERTISE][constants.AUTH] = "0000"
        adEndpointSockets[i].emit(constants.ON_CONNECTION_INITIATED,socket[constants.ADVERTISE])
      }
    }
  });

  socket.on(constants.ACCEPT_CONNECTION, function (info) {
    console.log(id(socket),'is accepting connection with',info[constants.ENDPOINT_ID] );

    for (var i in requestingConnection){
      if (id(requestingConnection[i]) == info[constants.ENDPOINT_ID]){
        if (request.includes(id(socket) + id(requestingConnection[i]))||
            request.includes(id(requestingConnection[i]) + id(socket)) ){
          console.log("endpoints",id(socket),id(requestingConnection[i]),"are already in accepting connected")
          return;
        }
        console.log('connection is accepted',request)
        request.push(id(socket) + id(requestingConnection[i]))


        connected.push(requestingConnection[i],socket)
        requestingConnection[i].emit(constants.ON_CONNECTION_RESULT,{[constants.STATE]:true,
            [constants.ENDPOINT_ID] : id(socket)})
        socket.emit(constants.ON_CONNECTION_RESULT,{[constants.STATE]:true,
            [constants.ENDPOINT_ID] : id(requestingConnection[i])})
      }
    }
  });

  socket.on(constants.SEND_PAYLOAD, function (info) {
    console.log(id(socket),'is sending payload ',info[constants.PAYLOAD],'to',info[constants.ENDPOINT_ID] );

    for (var i in connected){
      if (id(connected[i]) == info[constants.ENDPOINT_ID]){
        connected[i].emit(constants.ON_PAYLOAD_RECEIVED,info)
        connected[i].emit(constants.ON_PAYLOAD_TRANSFER_UPDATE,info)
        socket.emit(constants.ON_PAYLOAD_TRANSFER_UPDATE,info)
      }
    }
  });


  socket.on(constants.PAYLOAD_RECEIVED, function (info) {
    console.log(id(socket),'has received the payload');

    for (var i in connected){
      if (id(connected[i]) == info[constants.ENDPOINT_ID]){
        connected[i].emit(constants.ON_PAYLOAD_TRANSFER_UPDATE,info)
        socket.emit(constants.ON_PAYLOAD_TRANSFER_UPDATE,info)
      }
    }
  });

  // when the user disconnects.. perform this
  socket.on(constants.DISCONNECT, function () {
    console.log('a user is disconnected');

    if (connected.includes(socket)){
      connected.splice(connected.indexOf(socket));
    }
    
    for (j in request){
      console.log(request[j])
      if (request[j].indexOf(id(socket)) > -1){
        request.splice(j);
      }
    }
    console.log(request)
    if (discEndpointSockets.includes(socket)){
      discEndpointSockets.splice(discEndpointSockets.indexOf(socket));
    }
    if (adEndpointSockets.includes(socket)){//Notify the other endpoints that this endpoint has been lost
      adEndpointSockets.splice(adEndpointSockets.indexOf(socket));
      // for(j=0;j<discEndpointSockets.length;j++){
		  //   if(discEndpointSockets[j] != socket){
		  //     discEndpointSockets[j].emit(constants.ON_ENDPOINT_LOST, { //send the list of advertising users to the list of discovery
      //          endpointId : socket.endpointId
      //       });
		  //   }
	    // }
    }

  });
});

function id(endpoint){
  return endpoint[constants.ADVERTISE][constants.ENDPOINT_ID]
}
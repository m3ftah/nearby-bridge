'use strict';

const express = require('express');
const socketIO = require('socket.io');
const path = require('path');
var constants = require('./constants');
var control = require('./control');
var parse = require('./parse');

const PORT = process.env.PORT || 80;
const INDEX = path.join(__dirname, 'public');

const server = express()
  .use(express.static(INDEX))
  .listen(PORT, () => console.log(`Listening on ${ PORT }`));

const io = socketIO(server);

global.all = [];

global.discoveryCopy = [];

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


setInterval(discoverEndpoint, 5000);

function discoverEndpoint(){
  global.discovery.forEach((tab,tIndex)=>{
    var socket = global.all[tIndex];
    if (socket && socket.discovered){//the endpoint is discovering.
      var tmp = [];
      tab.forEach((near,index) => {
          //console.log(index);
          var notified = false;
          if(global.discoveryCopy && global.discoveryCopy[tIndex] && global.discoveryCopy[tIndex][index] == near){
            notified = true
            console.log("already notified", index, "and", tIndex);
          }
          var endpoint = global.all[index];
          if (!notified && endpoint){//The other endpoint has already advertised
            if (near) tmp.push(index);
            console.log("notifying: ",socket.id,endpoint.id);
            notifyEndpoints(socket, endpoint, near);
          }
          if (!endpoint){
            //console.log(index, "endpoint in dataset, but didn't connect");
          }
          else if (!endpoint.advertised) console.log("endpoint in dataset but didn't advertise yet");
      });
      console.log(global.second + ":",tIndex,tmp)
    }else if (global.all[tIndex]) console.log(tIndex,"Endpoint did not discover");
    else console.log(tIndex, "endpoint doesn't exist yet");    
  })
  for (var i = 0; i < global.discovery.length; i++)
    if (global.discovery[i])
      global.discoveryCopy[i] = global.discovery[i].slice();
};

function notifyEndpoints(socket, endpoint, near){
  if (near){//near
    console.log(socket.id,"has discovered", endpoint.id);
    socket.nearby.add(endpoint.id);
    endpoint.nearby.add(socket.id);
    if (endpoint.advertised){
      socket.emit(constants.ON_ENDPOINT_FOUND,endpoint[constants.ADVERTISE]);
      socket.found.add(endpoint.id);
    }
    if (socket.advertised){
      endpoint.emit(constants.ON_ENDPOINT_FOUND,socket[constants.ADVERTISE]);
      endpoint.found.add(socket.id);
    }
  }else{//away
    console.log(socket.id,"is away from",endpoint.id);
    socket.emit(constants.ON_ENDPOINT_LOST,{[constants.ENDPOINT_ID] : endpoint.id});
    endpoint.emit(constants.ON_ENDPOINT_LOST,{[constants.ENDPOINT_ID] : socket.id});
    socket.nearby.delete(endpoint.id);
    endpoint.nearby.delete(socket.id);
  }
}

// Chatroom
var started = false;
io.on('connection', function (socket) {
  var addedUser = false;
  
  if (!started){
    //Parse
    parse.init();
    started = true;
  }
  console.log("new Connection", socket.handshake.headers['user-agent']);
  socket.id = global.all.length;
  global.all.push(socket);
  socket.discovered = [];
  socket.found = new Set();
  socket.requested = new Set();
  socket.connected = new Set();
  socket.nearby = new Set();
  console.log("number of connected Endpoints:",global.all.length);

  //when the client emits 'advertise', we add it to the list and we send the list to all clients who requested discovery
  socket.on(constants.ADVERTISE, function (info) {
    console.log('new user is advertising:',info[constants.ENDPOINT_NAME]);
    info[constants.ENDPOINT_ID] = socket.id;
    socket[constants.ADVERTISE] = info;
    socket[constants.ADVERTISE][constants.AUTH] = "0000"
    socket.advertised = true;

    // global.discEndpointSockets.forEach((element, index) => {
    //   //console.log(index, element.discovered ? element.discovered.length : 0)
    // });
  });
    
  //when the client emits 'discovery', we send to him the list of client
  socket.on(constants.DISCOVER, function (info) {
    console.log('new endpoint is discovering:',info[constants.SERVICE_ID]);
    socket[constants.DISCOVER] = info;
    socket.discovered = true;
    global.discoveryCopy[socket.id] = [];
    
    // global.all.forEach((element, index) => {
    //   console.log(index, element.discovered ? element.discovered.length : 0)
    // });
  });

  socket.on(constants.STOP_DISCOVERY, function (info) {
    console.log('endpoint:',socket.id,'is stopping discovering');
    socket.discovered = false;
  });
  
  socket.on(constants.STOP_ADVERTISING, function (info) {
    console.log('endpoint:',socket.id,'is stopping advertising');
    socket.advertised = false;
  });

  //when the client emits REQUEST_CONNECTION, we send the request to the other node
  socket.on(constants.REQUEST_CONNECTION, function (info) {
    socket.socketInfo = {
      [constants.ENDPOINT_ID] : socket.id,
      [constants.ENDPOINT_NAME] : info[constants.ENDPOINT_NAME],
      [constants.AUTH] : "0000"
    }
    console.log(socket.id,'is requesting connection with',info[constants.ENDPOINT_ID] );
    for (var i in global.all){
      var endpoint = global.all[i];
      if (endpoint[constants.ADVERTISE]) endpoint.socketInfo = endpoint[constants.ADVERTISE];
      if (endpoint.id == info[constants.ENDPOINT_ID]){
        //console.log("found, in progress for : ",socket.id,endpoint.id)

        socket.requested.add(endpoint.id);
        endpoint.requested.add(socket.id);
        
        endpoint.emit(constants.ON_CONNECTION_INITIATED,socket.socketInfo)
        socket.emit(constants.ON_CONNECTION_INITIATED,endpoint.socketInfo)
      }
    }
  });

  socket.on(constants.ACCEPT_CONNECTION, function (info) {
    //console.log(socket.id,'is accepting connection with',info[constants.ENDPOINT_ID] );
    if (socket.connected.size > 0){//TODO Check if this endpoint is already connected?
      //console.log("endpoint",socket.id,"is already connected, but accepting...");
      //return;
    }
    for (var i in global.all){
      var endpoint = global.all[i];
      if (endpoint.requested.has(socket.id) && endpoint.id == info[constants.ENDPOINT_ID]){
        endpoint.requested.delete(socket.id);//The first endpoint will accept the connection and won't
        socket.requested.delete(endpoint.id);
        endpoint.emit(constants.ON_CONNECTION_RESULT,{[constants.STATE]:true,
            [constants.ENDPOINT_ID] : socket.id});
        socket.emit(constants.ON_CONNECTION_RESULT,{[constants.STATE]:true,
            [constants.ENDPOINT_ID] : endpoint.id});
        socket.connected.add(endpoint.id);
        endpoint.connected.add(socket.id);
      }
    }
  });

  socket.on(constants.SEND_PAYLOAD, function (info) {
    //console.log(socket.id,'is sending payload ',info[constants.PAYLOAD],'to',info[constants.ENDPOINT_ID] );
    var endpoints = info[constants.PAYLOAD].split(',')
    endpoints.forEach(element => {
      if (element != socket.id){
        global.all.forEach(aElement => {
          if (aElement.id == element){
            if (!aElement.reached) aElement.reached = []
            if (aElement.reached.indexOf(socket.id) === -1) aElement.reached.push(socket.id);
          }
        })
      }
    })
    global.all.forEach( (element,index) => {
      //console.log(index, element.reached ? element.reached.length : 0)
    })

    socket.connected.forEach((socketId)=>{
      global.all.forEach((endpoint)=>{
        if (endpoint.id == socketId && endpoint.id == info[constants.ENDPOINT_ID]){//TODO add message broadcast
          endpoint.emit(constants.ON_PAYLOAD_RECEIVED,info)
        }
      })
    })

  });
  
  socket.on(constants.PAYLOAD_RECEIVED, function (info) {
    //console.log(socket.id,'has received the payload');
    socket.connected.forEach((endpointId)=>{
      global.all.forEach((endpoint)=>{
        if (endpoint.id == endpointId){
          endpoint.emit(constants.ON_PAYLOAD_TRANSFER_UPDATE,info)
          socket.emit(constants.ON_PAYLOAD_TRANSFER_UPDATE,info)
        };
      });
    });
  });

  // when the user disconnects.. perform this
  socket.on(constants.DISCONNECTING, function (info) {
    //console.log('a device is asking to disconnect');
    if (info){
      global.all.forEach((endpoint)=>{
        if (endpoint.id == info[constants.ENDPOINT_ID]){
          console.log(socket.id, 'is disconnecting from', endpoint.id);
          endpoint.emit(constants.ON_DISCONNECTED, {[constants.ENDPOINT_ID] : socket.id});
          socket.connected.delete(endpoint.id);
          endpoint.connected.delete(socket.id);
        }
      })
    }
  });

  // when the device disconnects.. perform this
  socket.on(constants.DISCONNECT, function () {
    console.log(socket.id, 'is disconnected from Nearby Bridge Server:');
    socket.advertised = false;
    socket.discovered = false;
  });

  // when the device disconnects.. perform this
  socket.on(constants.NEW_MESSAGE, function (message) {
    console.log(constants.NEW_MESSAGE, message);
    control.parse(message,socket);
  });
  
  socket.on('Ui', function (message) {
    uiSocket = socket;
    console.log('Ui dashboard');
    socket.emit('login',{numUsers:global.all.length});
  });


});
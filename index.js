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

global.discEndpointSockets = [];

global.all = [];

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


setInterval(discoverEndpoint, 5000);

function discoverEndpoint(){
  if (!global.discoveryCopy) global.discoveryCopy = [];
  global.discovery.forEach((tab,tIndex)=>{
    if (global.all[tIndex] && global.all[tIndex][constants.DISCOVER]){//the endpoint is discovering.
      var socket = global.all[tIndex];
      var tmp = [];
      tab.forEach((near,index) => {
          //console.log(index);
          var notified = false;
          if(global.discoveryCopy && global.discoveryCopy[tIndex] &&
              global.discoveryCopy[tIndex][index] && global.discoveryCopy[tIndex][index] == near){
                notified = true
                console.log("already notifed", index, "and", tIndex);
          }
          var endpoint = global.all[index];
          if (!notified && endpoint && endpoint[constants.ADVERTISE]){//The other endpoint has already advertised
            if (near){//near
              tmp.push(index);
              console.log(tIndex,socket.id,"has discovered", endpoint.id);
              socket.emit(constants.ON_ENDPOINT_FOUND,endpoint[constants.ADVERTISE]);
              socket.discovered.push(endpoint.id);
              if (socket[constants.ADVERTISE]){
                endpoint.emit(constants.ON_ENDPOINT_FOUND,socket[constants.ADVERTISE]);
                endpoint.discovered.push(socket.id);
              }
            }else{//away
              console.log(index,"is away from",tIndex);
              socket.emit(constants.ON_ENDPOINT_LOST,{[constants.ENDPOINT_ID] : endpoint.id});
              endpoint.emit(constants.ON_ENDPOINT_LOST,{[constants.ENDPOINT_ID] : socket.id});
              socket.discovered.splice(socket.discovered.indexOf(endpoint.id),1);         
              endpoint.discovered.splice(endpoint.discovered.indexOf(socket.id),1);
            }
            
          }
          if (!endpoint){
            //console.log(index, "endpoint in dataset, but didn't connect");
          }
          else if (!endpoint[constants.ADVERTISE]) console.log("endpoint in dataset but didn't advertise yet");
      });
      console.log(global.second + ":",tIndex,tmp)
    }else if (global.all[tIndex]) console.log(tIndex,"Endpoint did not discover");
    else console.log(tIndex, "endpoint doesn't exist yet");
  })
  for (var i = 0; i < global.discovery.length; i++)
    if (global.discovery[i])
      global.discoveryCopy[i] = global.discovery[i].slice();
};

// Chatroom
var started = false;
io.on('connection', function (socket) {
  var addedUser = false;
  
  if (!started){
    //Parse
    parse.init();
    started = true;
  }
  console.log("new Connection", socket.handshake.headers['user-agent'])
  global.all.push(socket);
  socket.discovered = []
  console.log("number of connected Endpoints:",global.all.length)

  //when the client emits 'advertise', we add it to the list and we send the list to all clients who requested discovery
  socket.on(constants.ADVERTISE, function (info) {
    console.log('new user is advertising:',info[constants.ENDPOINT_NAME]);
    info[constants.ENDPOINT_ID] = info[constants.ENDPOINT_NAME];//.replace(" ","_");// + "_1";
    socket[constants.ADVERTISE] = info
    socket.id = info[constants.ENDPOINT_ID]
    adEndpointSockets.push(socket)

    for(var i in global.discEndpointSockets){//Send this Endpoint to the endpoints that are discovering.
        if(global.discEndpointSockets[i] != socket){
          global.discEndpointSockets[i].emit(constants.ON_ENDPOINT_FOUND, socket[constants.ADVERTISE]);
          global.discEndpointSockets[i].discovered.push(socket.id);

        }
    }
    global.discEndpointSockets.forEach((element, index) => {
      //console.log(index, element.discovered ? element.discovered.length : 0)
    });
  });
    
  //when the client emits 'discovery', we send to him the list of client
  socket.on(constants.DISCOVER, function (info) {
    console.log('new endpoint is discovering:',info[constants.SERVICE_ID]);
    socket[constants.DISCOVER] = info
    global.discEndpointSockets.push(socket)
    if (!socket.discovered){//For the first time
      socket.discovered =[]
    }
    
    // global.all.forEach((element, index) => {
    //   console.log(index, element.discovered ? element.discovered.length : 0)
    // });
  });

  socket.on(constants.STOP_DISCOVERY, function (info) {
    console.log('endpoint:',socket.id,'is stopping discovering');
    global.discEndpointSockets.splice(global.discEndpointSockets.indexOf(socket),1);
    console.log('global.discEndpointSockets.length', global.discEndpointSockets.length)
  });
  
  socket.on(constants.STOP_ADVERTISING, function (info) {
    console.log('endpoint:',socket.id,'is stopping advertising');
    adEndpointSockets.splice(adEndpointSockets.indexOf(socket),1);
    console.log('adEndpointSockets.length', adEndpointSockets.length)
  });

  //when the client emits REQUEST_CONNECTION, we send the request to the other node
  socket.on(constants.REQUEST_CONNECTION, function (info) {
    socket.id = info[constants.ENDPOINT_NAME]
    console.log(socket.id,'is requesting connection with',info[constants.ENDPOINT_ID] );
    //console.log("adEndpointSockets.length",adEndpointSockets.length)
    for (var i in adEndpointSockets){
      if (adEndpointSockets[i].id == info[constants.ENDPOINT_ID]){
        //console.log("found, in progress for : ",socket.id,adEndpointSockets[i].id)
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
    //console.log(socket.id,'is accepting connection with',info[constants.ENDPOINT_ID] );
    if (getGroup(connected,socket.id).length){//Check if this endpoint is already connected?
      //console.log("endpoint",socket.id,"is already connected, but accepting...");
      //return;
    }
    var tmp = requestingConnection.slice();
    var requestingEndpoint;

    for (var i in tmp){
      if (tmp[i].id == info[constants.ENDPOINT_ID]){
        //console.log('connection is accepted')
        requestingEndpoint = tmp[i];
        requestingConnection.splice(i,1);
        tmp[i].emit(constants.ON_CONNECTION_RESULT,{[constants.STATE]:true,
            [constants.ENDPOINT_ID] : socket.id})
        socket.emit(constants.ON_CONNECTION_RESULT,{[constants.STATE]:true,
            [constants.ENDPOINT_ID] : tmp[i].id})
        connected.push([requestingEndpoint,socket]);
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

    var group = getGroup(connected,socket.id)
    for (var i in group){
      if (group[i].id == info[constants.ENDPOINT_ID]){
        group[i].emit(constants.ON_PAYLOAD_RECEIVED,info)
        group[i].emit(constants.ON_PAYLOAD_TRANSFER_UPDATE,info)
        socket.emit(constants.ON_PAYLOAD_TRANSFER_UPDATE,info)
      }
    }
  });
  
  socket.on(constants.PAYLOAD_RECEIVED, function (info) {
    //console.log(socket.id,'has received the payload');

    var group = getGroup(connected,socket.id)
    for (var i in group){
      if (group[i].id == info[constants.ENDPOINT_ID]){
        group[i].emit(constants.ON_PAYLOAD_TRANSFER_UPDATE,info)
        socket.emit(constants.ON_PAYLOAD_TRANSFER_UPDATE,info)
      }
    }
  });

  // when the user disconnects.. perform this
  socket.on(constants.DISCONNECTING, function () {
    //console.log('a device is asking to disconnect');

    var group = getGroup(connected,socket.id)

    if (group.length){//remove from connected table
      //console.log(connected.length);
      connected.splice(connected.indexOf(group),1);
      //console.log(connected.length)
      for(var j=0;j<group.length;j++){
        if ( group[j] != socket){
          console.log('sending disconnect to',group[j][constants.ADVERTISE][constants.ENDPOINT_ID],'from :', socket[constants.ADVERTISE][constants.ENDPOINT_ID]);
          group[j].emit(constants.ON_DISCONNECTED, { //send the list of advertising users to the list of discovery
            endpointId : socket[constants.ADVERTISE][constants.ENDPOINT_ID]
          });
        }
      }
    }else{
      //console.log('is not connected, but requested disconnection');
      //console.log(connected.length);
    }  
    if (global.discEndpointSockets.includes(socket)){//remove from the discovery table
      //global.discEndpointSockets.splice(global.discEndpointSockets.indexOf(socket),1);
    }
    if (adEndpointSockets.includes(socket)){//remove from the advertising table
      //adEndpointSockets.splice(adEndpointSockets.indexOf(socket),1);
    }
  });
  // when the device disconnects.. perform this
  socket.on(constants.DISCONNECT, function () {
    console.log('device is disconnected from Nearby Bridge Server:');
    console.log(socket[constants.ADVERTISE])
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

// function id(endpoint){
//   return endpoint.id ? endpoint.id : "";
//   // var id = ""
//   // if (endpoint && endpoint[constants.ADVERTISE] && endpoint[constants.ADVERTISE][constants.ENDPOINT_ID])
//   //   return endpoint[constants.ADVERTISE][constants.ENDPOINT_ID]
//   // else if (socket.id) return socket.id
//   // return id
// }

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
      if (group[j].id ==endpointId){
        return group;
      }
    }
  }
  return [];
}
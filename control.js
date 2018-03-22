module.exports =
{
    parse: function(message,socket){
        try{
            this[message](message, socket);
        }catch(e){
            if (e instanceof TypeError) {
                console.log("Wrong name of function", message)
                this.error(message, socket)
            } else throw e;
        }
    },
    reset: function(message, socket) {
        console.log("Resetting server...");
        socket.emit('new message',format("Resetting server..."));
    },
    error: function(message, socket) {
        console.log("Sending error message!");
        socket.emit('new message',format("Sorry...I didn't understand that! : " + message));
    },
    number: function(message, socket) {
        console.log("Number of discovering users!");
        socket.emit('new message',format("there are " + global.discEndpointSockets.length + " endpoints discovering"));
        if (global.discEndpointSockets.length) socket.emit('new message',format(global.discEndpointSockets.toString()));
    },
    disconnect: function(message, socket) {
        console.log("Disconnecting devices!");
        global.disconnect()
    }
}
function format(message){
    return {username : "Control", message : message}
}
'use strict';
const csv= require('csvtojson');
const csvFilePath='haggle-one-cambridge-city-complete.tsv';
var tab = [];
var second = 0;
var next = 0;
var discovery = [];
csv({
    noheader: true,
    delimiter: "\t",
    trim:true
})
.fromFile(csvFilePath)
.on('json',(j)=>{
    var t = [parseInt(j.field1),parseInt(j.field3),parseInt(j.field4),j.field5 == 'up' ? true : false];
    tab.push(t);
})
.on('done',(error)=>{
    //console.log(tab)
    setInterval(updateTable, 1000);
});
function updateTable() {
    console.log(second);
    while (tab[next][0] == second){
        if( !discovery[tab[next][1]])
            discovery[tab[next][1]] = [];
        discovery[tab[next][1]][tab[next][2]] = tab[next][3]
        //console.log(tab[next])
        next++;
    }
    second++;
 };
 function discoverEndpoint(id1){
     var id1 = 14;
     console.log(discovery[id1])
     if (discovery[id1]){
        discovery[id1].forEach((element) => {
            console.log(element);
        });
     }
    return id1;
 };
 setTimeout(discoverEndpoint, 5000);
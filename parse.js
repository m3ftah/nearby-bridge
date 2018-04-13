'use strict';
const csv = require('csvtojson');
const csvFilePath = 'haggle-one-cambridge-city-complete.tsv';
var tab = [];
var second = 0;
var next = 0;
var discovery = [];
csv({
    noheader: true,
    delimiter: "\t",
    trim: true
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
        update(tab[next][1],tab[next][2],tab[next][3]);
        update(tab[next][2],tab[next][1],tab[next][3]);
        next++;
    };
    second++;
 };
 function update(id1, id2, state){
    if(!discovery[id1])
        discovery[id1] = [];
    if (state) discovery[id1].push(id2);
    else{
        var index = discovery[id1].indexOf(id2);
        if (index !== -1) discovery[id1].splice(index, 1);
    }
 };
 function discoverEndpoint(id1){
    var id1 = 14;
    console.log(discovery[id1]);
    return discovery[id1];
 };
 setInterval(discoverEndpoint, 1000);
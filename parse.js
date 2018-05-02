'use strict';
const csv= require('csvtojson');
//const csvFilePath='haggle-one-cambridge-city-complete.tsv';
const csvFilePath='test.tsv';
global.tab = [];
global.second = 0;
global.next = 0;
global.discovery = [];
module.exports = {
    init : ()=>{
        csv({
            noheader: true,
            delimiter: "\t",
            trim:true
        })
        .fromFile(csvFilePath)
        .on('json',(j)=>{
            var t = [parseInt(j.field1),parseInt(j.field3),parseInt(j.field4),j.field5 == 'up' ? true : false];
            global.tab.push(t);
        })
        .on('done',(error)=>{
            //console.log(global.tab)
            setInterval(module.exports.updateTable, 1000);
        });
    },
    updateTable : ()=>{
        //console.log(global.second);
    while (global.next < global.tab.length && global.tab[global.next][0] == global.second){
        if( !global.discovery[global.tab[global.next][1]])
            global.discovery[global.tab[global.next][1]] = [];
        global.discovery[global.tab[global.next][1]][global.tab[global.next][2]] = global.tab[global.next][3]
        //console.log(global.tab[global.next])
        global.next++;
    }
    if (global.next >= global.tab.length) console.log("Dataset is finished")
    global.second++;
    }
}

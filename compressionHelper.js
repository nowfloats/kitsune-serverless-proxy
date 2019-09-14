const zlib = require('zlib');
const brotli = require('brotli');

const compressBR = async function (data){
    try{
        let brCompressed = brotli.compress(data);
        if(brCompressed){
            return Buffer.from(brCompressed.buffer);
        }
    }catch(ex){
        //Log exception
    }
    return null;
    
};

const compressGZ = async function (data) {
    try{
        return zlib.gzipSync(data);
    }catch(ex){
        //Log exception
    }
    return null;
};

exports.compressBR = compressBR;
exports.compressGZ = compressGZ;
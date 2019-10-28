require("dotenv").config();
const Cloud = require('./Cloud');
const utils = require("./utils");
const {PassThrough} = require('stream')
const storage = require('azure-storage');

const debugMode = (process.env.DEBUG_MODE === "true");
const traceMode = (process.env.TRACE_MODE === "true");



class AZURECloud extends Cloud {
    constructor(creds, region){
        super(creds, region);
        this.blobService = storage.createBlobService();

    }
    async storageGet(params, encoding){
        try{
            let storageparams = Object.assign({}, params); 
        
            if(debugMode) console.log("Azure storageGet");
            
            if(encoding){
                storageparams.Key = `${encoding}/${params.Key}`
            }
            //TODO: Optimize for GC
            let data = [];
            let body = null;
            let stream = new PassThrough();
    
           
            //Returns blob http response wihout body
            var blobResult = await new Promise((resolve, reject) => {
                this.blobService.getBlobToStream(storageparams.Bucket, storageparams.Key, stream, function(error, result, httpResponse){
                    
                        if (error) {
                            if(traceMode){
                                console.log(`[Error] Blob download error : "${storageparams.Key}"`);
                                console.log(error);
                            }
                            resolve(null);
                        } else if(httpResponse){
                            if(debugMode){
                                console.log(`Blob download success httpResponse: "${storageparams.Key}"`);
                                console.log(httpResponse);
                            }
    
                            resolve(httpResponse); 
                        } 
                        else{
                            if(traceMode){
                                console.log(`[Error] ob download undefined : "${storageparams.Key}"`);
                                resolve(null);
                            }
                        }
                });
            });
    
            //If blob response not null then get the body
            if(blobResult){
                stream.on('data', (d) => {
                    data.push(d);
                });
                await new Promise((resolve, reject) => {
                    stream.on('end', function(){
                        body = Buffer.concat(data);
                        resolve();
                    });
                });
            
            
                blobResult.status = blobResult.statusCode;
                blobResult.body = body;
                
                if(debugMode){
                    console.log("blobResult");
                    console.log(blobResult);
                }
                
                return blobResult;
            }
        }
        catch(ex){
            if(traceMode){
                console.log("[Error] Azure storageGet");
                console.log(ex);
            }
        }
        
        return null;
        
    }
    async storagePut(params){
        try{
            var blobUploadResult = await new Promise((resolve, reject) => {
                this.blobService.createBlockBlobFromText(params.Bucket, params.Key, params.Body, {
                    contentSettings: {
                        contentType: params.ContentType,
                        contentEncoding: params.ContentEncoding
                      }
                }, err => {
                    if (err) {
                        console.log("uploadBlob failed : "+ params.Key);
                        console.log(err);
                        resolve(false);
                    } else {
                        console.log("uploadBlob success : " + params.Key);
                        resolve(true);
                    }
                });
            });
            return blobUploadResult;
        }catch(ex){
            if(traceMode){
                console.log("[Error] Azure storagePut");
                console.log(ex);
            }
        }
        return null;
    }    
    async storageDelete(keysToDelete){
        //TODO 
    }
    async storageList (path, continuationToken){
        //TODO
    }
    async storageListAllFiles (path){
        //TODO
    }
    async invalidateCDNCache(itemsToBeInvalidated){
        //TODO
    }
}
module.exports = AZURECloud;
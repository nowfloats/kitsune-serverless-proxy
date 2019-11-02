require("dotenv").config();
const Cloud = require('./Cloud');
const utils = require("./utils");
const {PassThrough} = require('stream')
const storage = require('azure-storage');

const debugMode = (process.env.DEBUG_MODE === "true");
const traceMode = (process.env.TRACE_MODE === "true");

var msRestAzure = require('ms-rest-azure');
var cdnManagementClient = require('azure-arm-cdn');

class AZURECloud extends Cloud {
    constructor(creds, region){
        super(creds, region);
        this.blobService = storage.createBlobService();

    }
    async storageGet(params, encoding){
        try{
            let storageparams = Object.assign({}, params); 
        
            if(debugMode) console.log("Azure storageGet");
            
            if(encoding){
                storageparams.Key = `${encoding}/${params.Key}`
            }
            //TODO: Optimize for GC
            let data = [];
            let body = null;
            let stream = new PassThrough();
    
           
            //Returns blob http response wihout body
            var blobResult = await new Promise((resolve, reject) => {
                this.blobService.getBlobToStream(storageparams.Bucket, storageparams.Key, stream, function(error, result, httpResponse){
                    
                        if (error) {
                            if(traceMode){
                                console.log(`[Error] Blob download error : "${storageparams.Key}"`);
                                console.log(error);
                            }
                            resolve(null);
                        } else if(httpResponse){
                            if(debugMode){
                                console.log(`Blob download success httpResponse: "${storageparams.Key}"`);
                                console.log(httpResponse);
                            }
    
                            resolve(httpResponse); 
                        } 
                        else{
                            if(traceMode){
                                console.log(`[Error] ob download undefined : "${storageparams.Key}"`);
                                resolve(null);
                            }
                        }
                });
            });
    
            //If blob response not null then get the body
            if(blobResult){
                stream.on('data', (d) => {
                    data.push(d);
                });
                await new Promise((resolve, reject) => {
                    stream.on('end', function(){
                        body = Buffer.concat(data);
                        resolve();
                    });
                });
            
            
                blobResult.status = blobResult.statusCode;
                blobResult.body = body;
                
                if(debugMode){
                    console.log("blobResult");
                    console.log(blobResult);
                }
                
                return blobResult;
            }
        }
        catch(ex){
            if(traceMode){
                console.log("[Error] Azure storageGet");
                console.log(ex);
            }
        }
        
        return null;
        
    }
    async storagePut(params){
        try{
            var blobUploadResult = await new Promise((resolve, reject) => {
                this.blobService.createBlockBlobFromText(params.Bucket, params.Key, params.Body, {
                    contentSettings: {
                        contentType: params.ContentType,
                        contentEncoding: params.ContentEncoding
                      }
                }, err => {
                    if (err) {
                        console.log("uploadBlob failed : "+ params.Key);
                        console.log(err);
                        resolve(false);
                    } else {
                        console.log("uploadBlob success : " + params.Key);
                        resolve(true);
                    }
                });
            });
            return blobUploadResult;
        }catch(ex){
            if(traceMode){
                console.log("[Error] Azure storagePut");
                console.log(ex);
            }
        }
        return null;
    }    
    async storageDelete(keysToDelete, bucketName){
        //TODO : check if multi delete option is available, optimize the current code.
        
        var objectsToBeDeleted = [];
        if(keysToDelete && keysToDelete.length > 0){
            keysToDelete.forEach(function(key){
                key = utils.ltrim(key, "/")
                objectsToBeDeleted.push(key);
                objectsToBeDeleted.push('br/' + key);
                objectsToBeDeleted.push('gzip/' + key);
            })
        }
        console.log("objectsToBeDeleted");
        console.log(objectsToBeDeleted);
        if(objectsToBeDeleted.length > 0){
            let deletedObjectsLength = 0;
            for(var i =0; i < objectsToBeDeleted.length; i++){
                try{
                    await new Promise((resolve, reject) => {
                            this.blobService.deleteBlobIfExists(bucketName, objectsToBeDeleted[i], err => {
                                if (err) {
                                    if(debugMode){
                                        console.log("[Error] deleteBlobIfExists");
                                        console.log(err);
                                    }
                                    resolve(null);
                                } else {
                                    deletedObjectsLength++;
                                    resolve(true);
                                }
                            });
                        });
                }
                catch(ex){
                    if(debugMode){
                        console.log("[Exception] deleteBlobIfExists");
                        console.log(ex);
                    }
                }
            }

            if(deletedObjectsLength < objectsToBeDeleted.length){
                if(traceMode){
                    console.log("Blob Delete Failed: deletedObjectsLength < objectsToBeDeleted.length");
                    console.log("deletedObjectsLength < objectsToBeDeleted.length : " + deletedObjectsLength + " < " + objectsToBeDeleted.length);

                    console.log(response);
                }
                return false;
            }
        }
        return true;
    }
    async storageList (path, containerName, continuationToken){
        //TODO
        return new Promise((resolve, reject) => {
            if(path)
            {
                this.blobService.listBlobsSegmentedWithPrefix(containerName, path, continuationToken, (err, data) => {
                    if (err) {
                        if(debugMode){
                            console.log("[Error] listBlobsSegmentedWithPrefix");
                            console.log(err);
                        }
                        resolve(null);
                    } else {
                        if(debugMode){
                            console.log(`${data.entries.length} blobs in '${containerName}' starting with '${path}'`);
                        }
                        resolve(data);
                    }
                });
            }
            else 
            {
                this.blobService.listBlobsSegmented(containerName, continuationToken, (err, data) => {
                    if (err) {
                        if(debugMode){
                            console.log("[Error] listBlobsSegmented");
                            console.log(err);
                        }
                        resolve(null);
                    } else {
                        console.log(`${data.entries.length} blobs in '${containerName}'`);
                        resolve(data);
                    }
                });
            }
        });
    }
    async storageListAllFiles (path, storageBucketName){
        //TODO
        let nextContinuationToken = null;
        let blobObjectsResult = null;
        let blobKeys = [];
        let formatedPath = utils.formatStoragePathRegex(path);
        if(debugMode){
            console.log("formatStoragePathRegex: " + utils.formatStoragePathRegex(path));
        }
        do{
            blobObjectsResult = await this.storageList(formatedPath, storageBucketName, nextContinuationToken);
            
            if(blobObjectsResult && blobObjectsResult.entries.length > 0){
                nextContinuationToken = blobObjectsResult.NextContinuationToken;
                blobObjectsResult.entries.forEach(function(blobObj){
                    blobKeys.push(blobObj.name);
                });
                if(debugMode){
                    console.log("blobObjectsResult.entries.length: " + blobObjectsResult.entries.length);
                    console.log("nextContinuationToken: " + nextContinuationToken);
                }
            }
        }
        while(nextContinuationToken);
        
        return blobKeys;
    }
    async invalidateCDNCache(itemsToBeInvalidated){

        var credentials = new msRestAzure.ApplicationTokenCredentials(process.env.AZURE_APPLICATION_ID, 
                                                                        process.env.AZURE_TENANT_ID, 
                                                                        process.env.AZURE_APPLICATION_SECRET);
        var cdnClient = new cdnManagementClient(credentials, process.env.AZURE_SUBSCRIPTION_ID);

        //TODO
        let purgeContentPaths = [];
        itemsToBeInvalidated.forEach(function(path){
            purgeContentPaths.push(utils.formatCDNPathRegex(path));
        });
        if(debugMode){
            console.log("purgeContentPaths: " + JSON.stringify(purgeContentPaths));
        }
        try{
            var result = new Promise((resolve, reject) => {
                
                cdnClient.endpoints.purgeContent(process.env.AZURE_RESOURCE_GROUP_NAME, 
                process.env.AZURE_CDN_PROFILE_NAME, 
                process.env.AZURE_CDN_ENDPOINT_NAME, 
                purgeContentPaths,function callback(err, result, request, response) {
                    if (err) {
                        console.log(err);
                        process.exit(1);
                        resolve(null);
                    } else {
                        console.log((result == null) ? "Done!" : result);
                        resolve(result);
                    }
                });
            });
                
            if(result){
                if(debugMode){
                    console.log("invalidateCDNCache: purge success");
                    console.log(result);
                }
                return true;
            }
            else{
                if(debugMode){
                    console.log("[Error] invalidateCDNCache");
                    console.log(result);
                }
                return false;
            }
        }catch(ex){
            if(debugMode){
                console.log("[Error] invalidateCDNCache");
                console.log(ex);
                }
            return false;
        }
       
    }
}
module.exports = AZURECloud;

require("dotenv").config();

const Cloud = require('./Cloud');
const AWS = require("aws-sdk");
const S3BATCHDELETECOUNT = 300;
const utils = require("./utils");

const debugMode = (process.env.DEBUG_MODE === "true");
const traceMode = (process.env.TRACE_MODE === "true");

class AWSCloud extends Cloud {
    constructor(option){
        super(option);
        AWS.config.region = option && option.region ? option.region : "ap-south-1";
    }
    async storageGet(params, encoding){
        let s3params = Object.assign({}, params); 
        
        if(encoding){
          s3params.Key = `${encoding}/${params.Key}`
        }
        var s3 = new AWS.S3();
        return await new Promise(function (resolve, reject) {
          try{
            s3.getObject(s3params, function (err, data) {
              if (err) {
                if (debugMode) {
                  console.log("S3 Key not found: " + s3params.Key);
                  console.log(err.message); // an error occurred
                }
                resolve(null);
              } else {
                var cacheControlString = "";
                if (data.ContentType && /html/i.test(data.ContentType)) {
                  //set html cache time as 24 hours
                  cacheControlString = 'public, max-age=86400';
                } else {
                  //set other asset type cache time as 1 year
                  cacheControlString = 'public, max-age=31536000';
                }
                
                var response = {
                  headers: {
                    'content-type': data.ContentType,
                    'content-length': data.ContentLength,
                    'cache-control': cacheControlString,
                    'x-powered-by': "kitsune runtime 0.2",
                    'x-kit-source': "Kitsune asset storage"
                  },
                  body: data.Body,
                  status: 200,
                  statusDescription: "OK"
                }
                if(data.ContentEncoding){
                  response.headers['content-encoding'] = data.ContentEncoding;
                }
                resolve(response);
              }
            });
          }catch(ex){
            if(debugMode){
              console.log(`[Error] Get S3 with encoding ${encoding}, for request : ${JSON.stringify(params)} : Error : ${ex.message}`);
            } 
            resolve(null);
          }
          
        });
    }
    async storagePut(params){
        var s3 = new AWS.S3();
        return await new Promise(function (resolve, reject) {
          s3.putObject(params, function (err, data) {
            if (err) {
              console.log(err, err.stack); // an error occurred
              reject(false);
            } else {
              if (debugMode) {
                console.log("S3 upload success" + bucket + ":" + key);
                console.log(data); // successful response
              }
              resolve(true);
            }
          });
        });
    }
    async storageDelete(keysToDelete){
        var objectsToBeDeleted = [];
        if(keysToDelete && keysToDelete.length > 0){
            keysToDelete.forEach(function(key){
                key = utils.ltrim(key, "/")
                objectsToBeDeleted.push({
                    Key: key 
                });
                objectsToBeDeleted.push({
                    Key: 'br/' + key 
                });
                objectsToBeDeleted.push({
                    Key: 'gzip/' + key 
                });
            })
        }
        if(objectsToBeDeleted.length > 0){
            let deletedObjectsLength = 0;
            let s3 = new AWS.S3();
    
            //Delete in batch of 300
            for(var i = 0; i < Math.ceil(objectsToBeDeleted.length / S3BATCHDELETECOUNT); i++){
                var params = {
                    'Bucket': process.env.STORAGE_BUCKET_NAME, 
                    'Delete': {
                            'Objects': objectsToBeDeleted.slice(i*S3BATCHDELETECOUNT, i*S3BATCHDELETECOUNT + S3BATCHDELETECOUNT), 
                            'Quiet': true
                        }
                };
                   
                if(debugMode){
                    console.log("s3.deleteObjects.params");
                    console.log(params.Delete);
                }
                var response = await new Promise(function (resolve, reject){
                    s3.deleteObjects(params, function(err, data) {
                        if (err){
                            if(debugMode) console.log(err, err.stack); // an error occurred
                            reject(err);
                        } 
                        else{
                            if(debugMode) console.log(data);           // successful response
                            resolve(data);
                        }
                    });
                });
                if(response && response.Deleted && response.Deleted.length > 0){
                    deletedObjectsLength += response.Deleted.length;
                }
            }
    
            if(deletedObjectsLength < objectsToBeDeleted.length){
                if(traceMode){
                    console.log("S3 Delete Failed: deletedObjectsLength < objectsToBeDeleted.length");
                    console.log("deletedObjectsLength < objectsToBeDeleted.length : " + deletedObjectsLength + " < " + objectsToBeDeleted.length);

                    console.log(response);
                }
                return false;
            }
            return true;
            /*
                data = {
                    Deleted: [
                        {
                            Key: "HappyFace.jpg", 
                            VersionId: "yoz3HB.ZhCS_tKVEmIOr7qYyyAaZSKVd"
                            }, 
                        {
                            Key: "HappyFace.jpg", 
                            VersionId: "2LWg7lQLnY41.maGB5Z6SWW.dcq0vx7b"
                        }
                    ]
                }
            */
        }
        return false;
    }
    async storageList (path, continuationToken){
        let s3 = new AWS.S3();
        var params = {
            Bucket: process.env.STORAGE_BUCKET_NAME, /* required */
            MaxKeys: 1000,
            Prefix: path
        };
        if(continuationToken){
            params["ContinuationToken"] = continuationToken;
        }
        if(debugMode){
            console.log("listS3Objects.params: " + JSON.stringify(params));
        }
        var s3ObjectsResult = new Promise(function(resolve, reject){
            s3.listObjectsV2(params, function(err, data) {
                if (err){
                    if(debugMode)
                        console.log(err, err.stack); // an error occurred
                    resolve(null);
                } 
                else{
                    resolve(data);
                }   
            });
        });
        return s3ObjectsResult;
    
        //S3 Response format
        /*
        data = {
            Contents: [
                {
                    ETag: "\"70ee1738b6b21e2c8a43f3a5ab0eee71\"", 
                    Key: "happyface.jpg", 
                    LastModified: <Date Representation>, 
                    Size: 11, 
                    StorageClass: "STANDARD"
                }, 
                {
                    ETag: "\"becf17f89c30367a9a44495d62ed521a-1\"", 
                    Key: "test.jpg", 
                    LastModified: <Date Representation>, 
                    Size: 4192256, 
                    StorageClass: "STANDARD"
                }
            ], 
            IsTruncated: true, 
            KeyCount: 2, 
            MaxKeys: 2, 
            Name: "examplebucket", 
            NextContinuationToken: "1w41l63U0xa8q7smH50vCxyTQqdxo69O3EmK28Bi5PcROI4wI/EyIJg==", 
            Prefix: ""
        }
       */
    }
    async storageListAllFiles (path){
        let nextContinuationToken = null;
        let s3ObjectsResult = null;
        let s3Keys = [];
        let formatedPath = utils.formatStoragePathRegex(path);
        if(debugMode){
            console.log("formatStoragePathRegex: " + utils.formatStoragePathRegex(path));
        }
        nextContinuationToken = null;
    
        do{
            s3ObjectsResult = await this.storageList(formatedPath, nextContinuationToken);
            
            if(s3ObjectsResult && s3ObjectsResult.KeyCount > 0){
                nextContinuationToken = s3ObjectsResult.NextContinuationToken;
                s3ObjectsResult.Contents.forEach(function(s3obj){
                    s3Keys.push(s3obj.Key);
                });
                if(debugMode){
                    console.log("s3ObjectsResult.KeyCount: " + s3ObjectsResult.KeyCount);
                    console.log("nextContinuationToken: " + nextContinuationToken);
                }
            }
        }while(nextContinuationToken);
        
        return s3Keys;
    }
    async invalidateCDNCache(itemsToBeInvalidated){
        if(itemsToBeInvalidated && Array.isArray(itemsToBeInvalidated) && itemsToBeInvalidated.length > 0){
            
            let cdnPathsToInvalidate = [];
            itemsToBeInvalidated.forEach(function(path){
                cdnPathsToInvalidate.push(utils.formatCDNPathRegex(path));
            });
            if(debugMode){
                console.log("cdnPathsToInvalidate: " + JSON.stringify(cdnPathsToInvalidate));
            }

            let cloudfront = new AWS.CloudFront();
            let items = [];
            itemsToBeInvalidated.forEach(function(item){
                items.push('/' + utils.ltrim(item, "/"));
            })
    
            var params = {
                DistributionId: process.env.CDN_ID, /* required */
                InvalidationBatch: { /* required */
                    CallerReference: new Date().getTime().toString(), /* required */
                    Paths: { /* required */
                        Quantity: items.length, /* required */
                        Items: items
                    }
                }
            };
            if(debugMode) console.log("CDN Request Parameters :" + JSON.stringify(params));
            return await new Promise(function (resolve, reject){
    
                cloudfront.createInvalidation(params, function(err, data) {
                    if (err){
                        reject(err);
                        if(debugMode) console.log(err, err.stack); // an error occurred
                    } 
                    else{
                        resolve(data);
                        if(debugMode) console.log(data);           // successful response
                    }
                });
            });
                
        }
    }
   
    
}


  module.exports = AWSCloud;
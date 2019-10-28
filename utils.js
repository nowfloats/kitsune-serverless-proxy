function ltrim(str, chars) {
    chars = chars || "\s";
    return str.replace(new RegExp("^[" + chars + "]+", "g"), "");
}
function rtrim(str, chars) {
    chars = chars || "\s";
    return str.replace(new RegExp("[" + chars + "]$", "g"), "");
}
function formatCDNPathRegex(path){
    let formatedPath = null;
    if(path != null){
        formatedPath = path.trim();
        if(formatedPath == "*" || formatedPath == ""){
            formatedPath = "/*";
        }else{
            formatedPath = ("/" + ltrim(formatedPath, '/'));
            formatedPath = formatedPath.replace(/\*/g, "") + "*";
        }
    }
    return formatedPath;
}

function formatStoragePathRegex(path){
    let formatedPath = null;
    if(path != null){
        formatedPath = ltrim(path.trim(), '/');
        //Remove * from path
        formatedPath = formatedPath.replace(/\*/g, "");
    }
    return formatedPath;
}

module.exports = {
    ltrim, 
    rtrim ,
    formatCDNPathRegex,
    formatStoragePathRegex
}
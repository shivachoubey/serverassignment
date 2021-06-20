const express = require('express');
const multer = require('multer');
const cors = require('cors');
const mysql      = require('mysql');
const async = require('async');
const path = require('path');
const app = express();
const fs = require('fs');
const sharp = require('sharp');
const bodyParser = require("body-parser");
app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
const fileStorageEngine = multer.diskStorage({
    destination:(req, file,cb)=>{
        cb(null, './images')
    },
    filename:(req,file,cb)=>{
        cb(null, Date.now() + '__' +file.originalname)
    }
})
const multerFilter = (req, file, cb) => {
    if (file.mimetype.startsWith("image")) {
      cb(null, true);
    } else {
      cb("Please upload only images.", false);
    }
  };

const upload = multer({storage:fileStorageEngine,fileFilter: multerFilter});
var pool  = mysql.createPool({
    connectionLimit : 10,
    multipleStatements:true,
    host     : '127.0.0.1',
    port : '3306',
    user     : 'root',
    password : 'admin',
    database : 'mydb'
  });

  app.post('/register',upload.single('file'),async(req,res)=>{

    if(!req.file || !req.file.path){
        res.send({error:'Image is mandatory'});
        return;
    }

    const { filename: image } = req.file;
      
       await sharp(req.file.path)
        .resize(300, 300)
        .toFormat("jpeg")
        .jpeg({ quality: 90 })
        .toFile(
            path.resolve(req.file.destination,'resized',image)
        )
        fs.unlinkSync(req.file.path);

    var params=req.body;
    var codeMap={};
    var customerMap={};
    var id;
    async.series([
        function(cb){
            if(!params.name || !params.name.trim()){
                cb('Name is mandatory');
                return;
            }
            if(!params.email || !params.email.trim()){
                cb('Email is mandatory');
                return;
            }
            if(!params.dob || !params.dob.trim()){
                cb('DOB is mandatory');
                return;
            }
            if(!params.gender){
                cb('Gender is mandatory');
                return;
            }
            if(!params.topics || params.topics.length==0){
                cb('Topics is mandatory');
                return;
            }
            if(!params.about || !params.about.trim()){
                cb('Aboutme is mandatory');
                return;
            }
            pool.getConnection(function(err, connection) {
                if (err) {
                    cb('error connecting: ' + err.stack);
                    return;
                }
                connection.query('CALL regUser(?,?,?,?,?,?,?,?,@output);select @output as output;',[params.name.trim(),params.email.trim(),params.pwd.trim(),req.file.filename,params.about.trim(),params.dob.trim(),params.gender,params.age], function (error, results, fields) {
                    connection.release();
                    var out=null;
                    if (error) {
                        var errmsg='';  
                        if(error.code == 'ER_DUP_ENTRY'){
                            errmsg='Email already Registered';
                        }else{
                            errmsg='Some Error Occured';
                        }
                        console.log(error);
                        cb(errmsg);
                        
                      }else{
                        if(results[1][0].output){
                            id=results[1][0].output;
                          }
                          cb();
                      }
                     
                })
            })
    },function(cb){
        if(!id){
            cb('user not registered');
            return;
        }
        pool.getConnection(function(err, connection) {
            if (err) {
                cb('error connecting: ' + err.stack);
                return;
            }
            let topics =params.topics.split(',');
            let instopic=[];
            topics.forEach(function(topic){
                var ar =[];
                ar.push(id,topic);
                instopic.push(ar);
            })
            let stmt = `INSERT INTO topics(user_id,topic)  VALUES ?`;
            connection.query(stmt,[instopic], function (error, results, fields) {
                connection.release();
                if (error) {
                    console.error(error);
                    cb(error);
                  }
                  cb();
            })
        })
    }
    ],function(ferr){
        if(!ferr){
            res.send({some:'Saved Success'});
        }else{
            fs.unlinkSync('images/resized/'+req.file.filename);
            res.send({error:ferr});
        }
        
    });

})

app.post('/login', function(req, res){
    var params=req.body;
    console.log(params);
    if(!params.email || !params.email.trim()){
        res.send('Email is mandatory');
        return;
    }
    if(!params.pwd || !params.pwd.trim()){
        res.send('Password is mandatory');
        return;
    }
    var userid;
    var fmap={};
    var farr=[];
    async.series([
        function(cb){
            pool.getConnection(function(err, connection) {
                if (err) {
                    cb('error connecting: ' + err.stack);
                    return;
                }
        
                let stmt = `select * from users where email=? and pwd=?`;
                let parms = [params.email.trim(),params.pwd.trim()]
                    connection.query(stmt,parms, function (error, results, fields) {
                        connection.release();
                        if (error) {
                            console.error(error);
                            cb(error);
                          }
                          if(results && results.length>0){
                            userid=results[0].user_id;
                          }
                          cb();
                    })
        
            })
        },function(cb){
            if(!userid){
                cb('User not Registered');
                return;
            }

            pool.getConnection(function(err, connection) {
                if (err) {
                    cb('error connecting: ' + err.stack);
                    return;
                }
                let stmt = `select u.user_id,u.name,u.email,u.dob,u.gender,u.age,t.topic from users u inner join topics t on t.user_id=u.user_id `;
                let parms = [params.email.trim(),params.pwd.trim()]
                    connection.query(stmt,parms, function (error, results, fields) {
                        connection.release();
                        if (error) {
                            console.error(error);
                            cb(error);
                          }
                          if(results && results.length>0){
                              results.forEach(function(d){
                                  if(!fmap[d.user_id]){
                                      fmap[d.user_id]={};
                                  }
                                  if(!fmap[d.user_id].user){
                                    fmap[d.user_id].user=d
                                  }
                                  if(!fmap[d.user_id].topics){
                                    fmap[d.user_id].topics=[];
                                  }
                                  if(!fmap[d.user_id].topicmap){
                                    fmap[d.user_id].topicmap={};
                                  }
                                  if(!fmap[d.user_id].topicmap[d.topic]){
                                    fmap[d.user_id].topicmap[d.topic]=true;
                                    fmap[d.user_id].topics.push(d.topic)
                                  }
                                  
                                  


                              })
                          }
                          cb();
                    })
                    
            })
            
        },function(cb){
            if(!fmap || !fmap[userid] || !fmap[userid].topics || fmap[userid].topics.length<3){
                cb();
                return
            }
            var topicmap = fmap[userid].topicmap;
            var age = fmap[userid].user.age;
            for (var key in fmap){
                var c=0;
                if(key!=userid){
                    fmap[key].topics.forEach(function(d){
                        if(topicmap[d]){
                            c++;
                            if(c==3 && Math.abs(fmap[key].user.age - age)!=6){
                                farr.push(fmap[key].user);
                            }
                        }
                    })
                }
            }
cb();
        }
    ],function(ferr){
        if(!ferr){
            res.send(farr);
        }else{
            res.send(ferr);
        }
        
    });
    
})
app.get('/gettopics',(req,res) => {
    pool.getConnection(function(err, connection) {
        if (err) {
            cb('error connecting: ' + err.stack);
            return;
        }
        let stmt = `select * from matertopics`;
        connection.query(stmt, function (error, results, fields) {
            connection.release();
            if (error) {
                console.error(error);
                res.send(error);
              }
              res.send(results);
        })
    })
})

app.listen(3000, function () {
    console.log('Nodejs app listening on port 3000')
  });
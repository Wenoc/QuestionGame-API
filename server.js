const express = require("express");
const app = express();
const mysql = require("mysql");
const port = process.env.PORT || 80;
const cors = require("cors");
const multer = require("multer");
var path = require("path");

const mysqlprom = require("mysql2/promise");
const { CONNREFUSED } = require("dns");

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const connection = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "exam",
});

var corsOptions = {
  origin: "http://127.0.0.1:5173",
};
app.use(cors(corsOptions));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "public/Imgs");
  },
  filename: (req, file, cb) => {
    const { originalname } = file;
    cb(null, Date.now() + originalname);
  },
});
const upload = multer({ storage });

const server = require("http").createServer(app);
const io = require("socket.io")(server, { cors: { origin: "*" } });

server.listen(port, () => {
  console.log("API running", port);
});

let lobbys = [];

io.on("connection", (socket) => {
  socket.on("joinlobby", (lobbytoken, userdata, cb) => {
    if (lobbys[lobbytoken]) {
      lobbys[lobbytoken].push(userdata.Name);
    } else {
      lobbys[lobbytoken] = [];
      lobbys[lobbytoken].push(userdata.Name);
    }
    connection.query("SELECT * FROM lobby WHERE Token=?", lobbytoken, function (slerr, slres) {
      if (slerr) throw slerr;
      if (slres.length) {
        if (slres[0].Started != 1) {
          connection.query("SELECT * FROM lobbymembers WHERE UserID=?", userdata.UserID, function (slmerr, slmres) {
            if (slmerr) throw slmerr;
            if (!slmres.length) {
              let info = {
                UserID: userdata.UserID,
                LobbyID: slres[0].id,
                Score: 0,
              };
              connection.query("INSERT INTO lobbymembers SET ?", info, function (ilerr, ilres) {
                if (ilerr) throw ilerr;
                console.log("Csatlakozott a lobbyhoz: " + lobbytoken + " - " + userdata.UserID + " | " + userdata.Name);
                io.to(lobbytoken).emit("userjoined", userdata);
                socket.join(lobbytoken);
                socket.lobbytoken = lobbytoken;
                socket.userdata = userdata;
                cb(lobbys[lobbytoken]);
              });
            }
          });
        } else {
          cb(false);
          // Lobby started
        }
      } else {
        cb(false);
        // No lobby
      }
    });
  });

  socket.on("disconnect", (a) => {
    if (socket.lobbytoken) {
      connection.query("DELETE FROM lobbymembers WHERE UserID=?", socket.userdata.UserID, function (dlerr, dlres) {
        if (dlerr) throw dlerr;
        lobbys[socket.lobbytoken] = lobbys[socket.lobbytoken].filter((e) => e != socket.userdata.Name);
        io.to(socket.lobbytoken).emit("userleft", lobbys[socket.lobbytoken]);
      });
    }
  });

  // Admin things \\

  socket.on("adminjoinlobby", (lobbytoken, userdata, cb) => {
    socket.join(lobbytoken);
    connection.query("SELECT * FROM lobby WHERE Token=?", lobbytoken, function (slerr, slres) {
      connection.query("SELECT * FROM questions WHERE LobbyID=?", slres[0].id, function (sqerr, sqres) {
        if (sqerr) throw sqerr;
        let info = {
          lobbys: lobbys[lobbytoken] || [],
          questions: sqres || [],
          started: slres[0].Started,
        };
        cb(info);
      });
    });
  });

  socket.on("startlobby", (lobbytoken, admin, cb) => {
    connection.query("SELECT * FROM lobby WHERE Token=?", lobbytoken, function (slerr, slres) {
      if (slerr) throw slerr;
      if (slres.length) {
        connection.query("UPDATE lobby SET Started=1 WHERE Token=?", lobbytoken, function (ulerr, ulres) {
          if (ulerr) throw ulerr;
          lobbys[lobbytoken] = [];
          io.to(lobbytoken).emit("lobbystarted", lobbytoken, admin);
          cb(true);
        });
      }
    });
  });

  socket.on("stoplobby", (lobbytoken, admin, cb) => {
    connection.query("SELECT * FROM lobby WHERE Token=?", lobbytoken, function (slerr, slres) {
      if (slerr) throw slerr;
      if (slres.length) {
        connection.query("UPDATE lobby SET Started=0 WHERE Token=?", lobbytoken, function (ulerr, ulres) {
          if (ulerr) throw ulerr;
          io.to(lobbytoken).emit("lobbystopped", lobbytoken, admin);
          lobbys[lobbytoken] = [];
          cb(true);
        });
      }
    });
  });

  // Game sockets \\

  socket.on("joinongoinggame", (lobbytoken, userdata, cb) => {
    if (lobbys[lobbytoken]) {
      lobbys[lobbytoken].push(userdata.Name);
    } else {
      lobbys[lobbytoken] = [];
      lobbys[lobbytoken].push(userdata.Name);
    }
    connection.query("SELECT * FROM lobby WHERE Token=?", lobbytoken, function (slerr, slres) {
      if (slerr) throw slerr;
      if (slres.length) {
        // if (slres[0].Started != 1) {
        connection.query("SELECT * FROM lobbymembers WHERE UserID=?", userdata.UserID, function (slmerr, slmres) {
          if (slmerr) throw slmerr;
          if (!slmres.length) {
            console.log("0");
            let info = {
              UserID: userdata.UserID,
              LobbyID: slres[0].id,
              Score: 0,
            };
            connection.query("INSERT INTO lobbymembers SET ?", info, function (ilerr, ilres) {
              if (ilerr) throw ilerr;
              console.log("Csatlakozott a lobbyhoz: " + lobbytoken + " - " + userdata.UserID + " | " + userdata.Name);
              io.to(lobbytoken).emit("userjoined", userdata);
              socket.join(lobbytoken);
              socket.lobbytoken = lobbytoken;
              socket.userdata = userdata;
              cb(lobbys[lobbytoken]);
            });
          } else {
            console.log("Csatlakozott a lobbyhoz: " + lobbytoken + " - " + userdata.UserID + " | " + userdata.Name);
            io.to(lobbytoken).emit("userjoined", userdata);
            socket.join(lobbytoken);
            socket.lobbytoken = lobbytoken;
            socket.userdata = userdata;
            cb(lobbys[lobbytoken]);
          }
        });
        // } else {
        //   cb(false);
        //   // Lobby started
        // }
      } else {
        cb(false);
        // No lobby
      }
    });
  });

  socket.on("changequestionstatus", (lobbytoken, questionid, status, cb) => {
    connection.query("UPDATE questions SET Active=? WHERE id=?", [status, questionid], function (uqerr, uqres) {
      if (uqerr) throw uqerr;
      if (status == 1) {
        connection.query("SELECT id, Title, SoundURL, ImgURL, AnswerA, AnswerB, AnswerC, AnswerD, Active FROM questions WHERE id=?", questionid, function (sterr, stres) {
          if (sterr) throw sterr;
          io.to(lobbytoken).emit("changedquestion", status, stres);
          cb({ started: Boolean(status) });
        });
      } else {
        // Calculate the scores \\
        connection.query("SELECT * FROM lobby WHERE Token=?", lobbytoken, function (slerr, slres) {
          if (slerr) throw slerr;
          connection.query("SELECT QuestionID FROM answers WHERE LobbyID=? ORDER BY id DESC LIMIT 1", slres[0].id, function (saerr, sares) {
            if (saerr) throw saerr;
            if (sares.length) {
              //
              connection.query("SELECT * FROM questions WHERE id=?", sares[0].QuestionID, function (sqerr, sqres) {
                if (sqerr) throw sqerr;
                connection.query("SELECT * FROM answers WHERE QuestionID=?", sqres[0].id, function (saaerr, saares) {
                  if (saaerr) throw saaerr;
                  let score = 100;
                  let counter = 0;
                  saares.forEach((e) => {
                    if (e.Answer == sqres[0].RightAnswer) {
                      connection.query("UPDATE lobbymembers SET Score=Score+? WHERE UserID=? AND LobbyID=?", [score, e.UserID, slres[0].id], function (userr, useres) {
                        if (userr) throw userr;
                      });
                      score -= 10;
                    }
                  });
                });
              });
              //
            }
          });
        });
        // const contprom = await mysqlprom.createConnection({
        //   host: "localhost",
        //   user: "root",
        //   password: "",
        //   database: "exam",
        // });
        // const [rows, fields] = await contprom.execute("SELECT * FROM lobby WHERE Token=?", [id]);
        // if (rows.length) {
        //   const [lastQuestionID, _] = await contprom.execute("SELECT QuestionID FROM answers WHERE LobbyID=? ORDER BY id DESC LIMIT 1;", [rows[0].id]);
        //   console.log(lastQuestionID);
        // } else {
        //   return res.status(200).json({
        //     success: false,
        //     message: "No game with this ID!",
        //   });
        // }
        // End of calculating scores \\
        io.to(lobbytoken).emit("changedquestion", status);
        cb({ started: Boolean(status) });
      }
    });
  });

  socket.on("sendanswer", (lobbytoken, userdata, answer, cb) => {
    connection.query("SELECT * FROM lobby WHERE Token=?", lobbytoken, function (slerr, slres) {
      if (slerr) throw slerr;
      if (slres.length) {
        connection.query("SELECT * FROM questions WHERE LobbyID=? AND Active=1", slres[0].id, function (sqerr, sqres) {
          if (sqerr) throw sqerr;
          let info = {
            LobbyID: slres[0].id,
            UserID: userdata.UserID,
            QuestionID: sqres[0].id,
            Answer: answer,
            Date: getFullDate(),
          };
          connection.query("INSERT INTO answers SET ?", info, function (iaerr, iares) {
            if (iaerr) throw iaerr;
            cb({ success: true, youranswer: answer });
          });
        });
      } else {
        cb({ success: false });
      }
    });
  });
});

app.post("/authenticate", (req, res) => {
  const { Token } = req.body;
  if (Token) {
    connection.query("SELECT * FROM sessions WHERE Token=?", Token, function (err, result) {
      if (err) throw err;
      if (result.length) {
        connection.query("SELECT * FROM users WHERE id=?", result[0].UserID, function (err, result) {
          if (err) throw err;
          if (result.length) {
            return res.status(200).json({
              success: true,
              message: "Sikeres ellenőrzés!",
              userdatas: {
                UserID: result[0].id,
                Name: result[0].Name,
                Permission: result[0].Permission,
              },
            });
          } else {
            return res.status(200).json({
              success: false,
              message: "Váratlan hiba történt!",
            });
          }
        });
      } else {
        return res.status(200).json({
          success: false,
          message: "Hibás token!",
        });
      }
    });
  } else {
    return res.status(200).json({
      success: false,
      message: "Töltsd ki az adatokat!",
    });
  }
});

app.post("/createuser", (req, res) => {
  const { Name } = req.body;
  if (Name) {
    connection.query("SELECT * FROM users WHERE Name=?", Name, function (sserr, ssres) {
      if (sserr) throw sserr;
      if (!ssres.length) {
        let info = {
          Name: Name,
          RegDate: getFullDate(),
        };
        connection.query("INSERT INTO users SET ?", info, function (err, result) {
          if (err) throw err;
          if (result.insertId > 0) {
            let sinfo = {
              UserID: result.insertId,
              Token: generateToken(32),
              Date: getFullDate(),
              Ip: getIp(req),
            };
            connection.query("INSERT INTO sessions SET ?", sinfo, function (serr, sres) {
              if (serr) throw serr;
              connection.query("SELECT * FROM lobby", function (slerr, slres) {
                if (slerr) throw slerr;
                if (slres.length) {
                  return res.status(200).json({
                    success: true,
                    message: "Sikeres regisztráció!",
                    lobbydatas: slres[0],
                    userdatas: {
                      UserID: result.insertId,
                      Name: info.Name,
                      Token: sinfo.Token,
                    },
                  });
                }
              });
            });
          } else {
            return res.status(200).json({
              success: false,
              message: "Váratlan hiba történt!",
            });
          }
        });
      } else {
        return res.status(200).json({
          success: false,
          message: "Már van ilyen nevű tanuló!",
        });
      }
    });
  } else {
    return res.status(200).json({
      success: false,
      message: "Töltsd ki az adatokat!",
    });
  }
});

// Verify Admin \\

app.post("/verifyadmin", (req, res) => {
  const { user } = req.body;
  connection.query("SELECT * FROM users WHERE id=?", user.UserID, function (err, result) {
    if (err) throw err;
    if (result.length) {
      if (result[0].Permission > 0) {
        return res.status(200).json({
          success: true,
        });
      } else {
        return res.status(200).json({
          success: false,
        });
      }
    } else {
      return res.status(200).json({
        success: false,
      });
    }
  });
});

// Get Lobby \\
// This will be without admin authentication !! \\
app.get("/getlobbys", (req, res) => {
  connection.query("SELECT * FROM lobby", function (err, result) {
    if (err) throw err;
    return res.status(200).json({
      success: true,
      lobbys: result,
    });
  });
});

app.get("/getadminpanellobbydatas/:userid/:lobby", (req, res) => {
  const { userid, lobby } = req.params;
  connection.query("SELECT * FROM users WHERE id=?", userid, function (err, result) {
    if (err) throw err;
    if (result.length) {
      if (result[0].Permission > 0) {
        connection.query("SELECT * FROM lobby WHERE Token=?", lobby, function (err, lbres) {
          if (err) throw err;
          if (lbres.length) {
            connection.query("SELECT * FROM lobbymembers WHERE LobbyID=?", lbres[0].id, function (lbmerr, lbmres) {
              if (err) throw err;
              // Need to be continued \\
              return res.status(200).json({
                success: true,
                lobby: lbres,
                lobbymembers: lbmres,
              });
            });
          } else {
            return res.status(200).json({
              success: false,
              message: "Nincs ilyen lobby!",
            });
          }
        });
      } else {
        return res.status(200).json({
          success: false,
          message: "Nincs jogod!",
        });
      }
    } else {
      return res.status(200).json({
        success: false,
        message: "Nincs ilyen felhasználó!",
      });
    }
  });
});

app.post("/addquestion", (req, res) => {
  const { Title, AnswerA, AnswerB, AnswerC, AnswerD, RightAnswer, Image, Audio, LobbyToken } = req.body;
  if ((Title && AnswerA && AnswerB && AnswerC && AnswerD && RightAnswer, LobbyToken)) {
    connection.query("SELECT * FROM lobby WHERE Token=?", LobbyToken, function (slerr, slresult) {
      if (slerr) throw slerr;
      if (slresult.length) {
        let info = {
          LobbyID: slresult[0].id,
          Title: Title,
          SoundURL: Audio,
          ImgURL: Image,
          AnswerA: AnswerA,
          AnswerB: AnswerB,
          AnswerC: AnswerC,
          AnswerD: AnswerD,
          RightAnswer: RightAnswer,
        };
        connection.query("INSERT INTO questions SET ?", info, function (err, result) {
          if (err) throw err;
          if (result.insertId) {
            info.id = result.insertId;
            return res.status(200).json({
              success: true,
              message: "Sikeresen hozzáadtad a kérdést",
              questiondata: info,
            });
          }
        });
      }
    });
  } else {
    return res.status(200).json({
      success: false,
      message: "Töltsd ki az adatokat!",
    });
  }
});

app.get("/getlobbyquestions/:lobbyid/:userid", (req, res) => {
  const { lobbyid, userid } = req.params;
  connection.query("SELECT * FROM users WHERE id=?", userid, function (err, result) {
    if (err) throw err;
    if (result.length) {
      if (result[0].Permission > 0) {
        connection.query("SELECT * FROM lobby WHERE Token=?", lobbyid, function (err, lbres) {
          if (err) throw err;
          if (lbres.length) {
            connection.query("SELECT * FROM questions WHERE LobbyID=?", lbres[0].id, function (lbmerr, lbmres) {
              if (lbmerr) throw lbmerr;
              return res.status(200).json({
                success: true,
                questions: lbmres || [],
              });
            });
          }
        });
      } else {
        return res.status(200).json({
          success: false,
        });
      }
    } else {
      return res.status(200).json({
        success: false,
      });
    }
  });
});

app.post("/deletequestion", (req, res) => {
  const { QuestionID, UserID } = req.body;
  connection.query("SELECT * FROM users WHERE id=?", UserID, function (err, result) {
    if (err) throw err;
    if (result.length) {
      if (result[0].Permission > 0) {
        connection.query("DELETE FROM questions WHERE id=?", QuestionID, function (err, result) {
          if (err) throw err;
          return res.status(200).json({
            success: true,
            message: "Sikeresen kitörölted a kérdést!",
          });
        });
      } else {
        return res.status(200).json({
          success: false,
        });
      }
    } else {
      return res.status(200).json({
        success: false,
      });
    }
  });
});

app.post("/upploadimage", upload.single("file"), async (req, res) => {
  console.log(req.file.filename);
  return res.status(200).json({
    filename: req.file.filename,
  });
});

app.get("/verifygame/:userid/:id", (req, res) => {
  const { id, userid } = req.params;
  if (id) {
    connection.query("SELECT * FROM lobby WHERE Token=?", id, function (err, result) {
      if (err) throw err;
      if (result.length) {
        if (result[0].Started == 1) {
          connection.query("SELECT id, Title, SoundURL, ImgURL, AnswerA, AnswerB, AnswerC, AnswerD, Active FROM questions WHERE Active=1", function (sterr, stres) {
            if (sterr) throw sterr;
            if (stres.length) {
              connection.query("SELECT * FROM answers WHERE QuestionID=? AND UserID=?", [stres[0].id, userid], function (saerr, saresult) {
                if (saerr) throw saerr;
                return res.status(200).json({
                  success: true,
                  question: stres || [],
                  answered: Boolean(saresult.length),
                });
              });
            } else {
              return res.status(200).json({
                success: true,
                question: stres || [],
                answered: false,
              });
            }
          });
        } else {
          return res.status(200).json({
            success: false,
          });
        }
      } else {
        return res.status(200).json({
          success: false,
        });
      }
    });
  } else {
    return res.status(200).json({
      success: false,
    });
  }
});

// Get Scoreboard \\
app.get("/getscoreboard/:id", async (req, res) => {
  const { id } = req.params;
  if (id) {
    connection.query("SELECT * FROM lobby WHERE Token=?", id, function (slerr, slres) {
      if (slerr) throw slerr;
      connection.query(
        "SELECT users.Name, Score FROM lobbymembers INNER JOIN users ON lobbymembers.UserID=users.id WHERE LobbyID=? ORDER BY lobbymembers.Score DESC",
        slres[0].id,
        function (slmerr, slmres) {
          if (slmerr) throw slmerr;
          return res.status(200).json({
            success: true,
            scoreboard: slmres || [],
          });
        }
      );
    });
    //   connection.query("SELECT users.Name, points.Points FROM `points` INNER JOIN users ON points.UserID=users.id WHERE LobbyID=?", slres[0].id, function (sperr, spres) {
    //     if (sperr) throw sperr;
    // });
  } else {
    return res.status(200).json({
      success: false,
      message: "Missing param!",
    });
  }
});

app.get("/Imgs/:id", (req, res) => {
  var options = {
    root: path.join("./public/Imgs/"),
  };

  var fileName = req.params.id;
  res.sendFile(fileName, options);
});

function getFullDate() {
  let date = new Date();
  let year = date.getFullYear();
  let month = date.getMonth() + 1;
  let day = date.getDate();
  let hour = date.getHours();
  let min = date.getMinutes();
  let sec = date.getSeconds();
  return `${year}-${month}-${day} ${hour}:${min}:${sec}`;
}

function generateToken(length) {
  var result = "";
  var characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  var charactersLength = characters.length;
  for (var i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

function getIp(req) {
  return req.headers["x-forwarded-for"] || req.connection.remoteAddress;
}

// app.listen(port, () => {
//   console.log("Api running " + port);
// });

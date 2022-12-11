const express = require("express");
const config = require("../config");
const getAbsolutePath = require('../utils')
const examples = require('../constants')
const path = require("path");
const axios = require("axios");
const fs = require("fs");
var multer = require('multer');
const download = require('download');

const router = express.Router();

var storage = multer.diskStorage({
    destination: function(req, file, callback) {
        callback(null, './assets/uploads');
    },
    filename: function(req, file, callback) {
        uniqueFileName = Date.now() + '-' + Math.round(Math.random() * 1E9);
        type = file.originalname.split('.').pop();
        callback(null, uniqueFileName + "." + type);
    }
});

var upload = multer({ storage: storage }).single('file');

var uniqueFileName = "";
var type = "";

// Method for saving file into folder ('/assets/uploads/')
router.post("/upload", async(req, res) => {
    await upload(req, res, async function(err) {
        // check for error
        if (err || req.file === undefined) {
            console.log(err)
            res.send("Error occured!")
        } else {
            res.send({ status: 200, message: "File Uploaded!", type: type, id: uniqueFileName })
        }
    });
});

// Method for extracting MP3 from YouTube video & save into folder ('/assets/uploads/')
router.post("/upload_yt", async(req, res) => {
    const options = {
        method: 'GET',
        url: config.rapidYoutubeMp3Config.url,
        params: { id: req.body.video_id },
        headers: {
            'X-RapidAPI-Key': config.rapidYoutubeMp3Config.apiKey,
            'X-RapidAPI-Host': config.rapidYoutubeMp3Config.host
        }
    };

    axios.request(options).then(function(response) {
        // Path at which image will get downloaded
        const filePath = getAbsolutePath() + "/assets/uploads";

        var uniqueFileId = Date.now() + '-' + Math.round(Math.random() * 1E9);

        download(response.data.link, filePath, { filename: `${uniqueFileId}.mp3` })
            .then(() => {
                console.log('Download Completed');
                res.send({ status: 200, message: "File Uploaded!", type: "mp3", id: uniqueFileId })
            })
    }).catch(function(error) {
        res.send({ status: 400, error: error })
    });
});

// Method for upoloading file to AssemblyAI
router.post("/upload_file", async(req, res) => {
    const assembly = axios.create({
        baseURL: "https://api.assemblyai.com/v2",
        headers: {
            authorization: config.assemblyAIConfig.apiKey,
            "content-type": "application/json",
            "transfer-encoding": "chunked",
        },
    });
    const file = getAbsolutePath() + "/assets/uploads/" + req.body.id + "." + req.body.type;
    fs.readFile(file, (err, data) => {
        if (err) return console.error(err);

        assembly
            .post("/upload", data)
            .then(async(resp) => {
                res.send({ status: 200, message: "File Uploaded!", upload_url: resp.data.upload_url })
            })
            .catch((err) => console.error(err));
    });
});

// Method for summarizing, Sentiment Analysing using Co:here
router.post("/summarize", async(req, res) => {
    var modals = req.body.modals.split(',');
    //console.log(modals)
    var jsonString = '{' + '"audio_url"' + ":" + '"' + req.body.upload_url.toString() + '",';
    for (let i = 0; i < modals.length; i++) {
        if (modals[i] == "summarization (bullets)") {
            jsonString += '"summarization" : true, "summary_model" : "informative", "summary_type" : "bullets",';
        } else if (modals[i] == "auto chapters") {
            jsonString += '"auto_chapters" : true,';
        } else if (modals[i] == "topic detection") {
            jsonString += '"iab_categories" : true,';
        } else if (modals[i] == "content moderation") {
            jsonString += '"content_safety" : true,';
        } else if (modals[i] == "important phrases") {
            jsonString += '"auto_highlights" : true,';
        } else if (modals[i] == "sentiment analysis") {
            jsonString += '"sentiment_analysis" : true,';
        } else if (modals[i] == "entity detection") {
            jsonString += '"entity_detection" : true,';
        } else if (modals[i] == "pii reduction") {
            jsonString += '"redact_pii" : true,"redact_pii_policies" : ["drug","number_sequence","person_name"],';
        } else if (modals[i] == "speaker labels") {
            jsonString += '"speaker_labels" : true,';
        } else if (modals[i] == "dual channel") {
            jsonString += '"dual_channel" : true,';
        } else if (modals[i] == "profanity filtering") {
            jsonString += '"filter_profanity" : true,';
        }

        if (i == modals.length - 1) {
            jsonString = jsonString.slice(0, -1) + '}';
        }
    }
    console.log(JSON.parse(jsonString));
    const assembly = axios.create({
        baseURL: "https://api.assemblyai.com/v2",
        headers: {
            authorization: config.assemblyAIConfig.apiKey,
            "content-type": "application/json",
            "transfer-encoding": "chunked",
        },
    });

    const response = await assembly.post("/transcript", JSON.parse(jsonString))

    // Interval for checking transcript completion
    const checkCompletionInterval = setInterval(async() => {
        const transcript = await assembly.get(`/transcript/${response.data.id}`)
        const transcriptStatus = transcript.data.status

        if (transcriptStatus !== "completed") {
            console.log(`Transcript Status: ${transcriptStatus}`)
        } else if (transcriptStatus === "completed") {
            let transcriptText = transcript.data.text
            clearInterval(checkCompletionInterval)

            var summary = null;
            var autoChapters = [];
            var topicDetection = [];
            var contentModeration = [];
            var importantPhrases = [];
            var sentimentCount = {
                positive: 0,
                negative: 0,
                neutral: 0
            }
            var entityDetection = [];
            var textWithSpeakerLabels = [];
            var textWithDualChannel = [];

            if (transcript.data.summary) {
                summary = transcript.data.summary;
            }

            if (transcript.data.chapters) {
                if (transcript.data.chapters.length > 0) {
                    transcript.data.chapters.forEach(chapter => {
                        autoChapters.push({ headline: chapter.headline, summary: chapter.summary })
                    });
                }
            }

            if (transcript.data.iab_categories_result) {
                if (transcript.data.iab_categories_result.summary) {
                    // Read key
                    for (var key in transcript.data.iab_categories_result.summary) {
                        if (transcript.data.iab_categories_result.summary[key] > 0.07) {
                            topicDetection.push(insertSpaces(key.split('>').pop()))
                        }
                    }
                }
            }

            if (transcript.data.content_safety_labels) {
                if (transcript.data.content_safety_labels.summary) {
                    // Read key
                    for (var key in transcript.data.content_safety_labels.summary) {
                        if (transcript.data.content_safety_labels.summary[key] > 0) {
                            contentModeration.push(key)
                        }
                    }
                }
            }

            if (transcript.data.auto_highlights_result) {
                if (transcript.data.auto_highlights_result.results.length > 0) {
                    transcript.data.auto_highlights_result.results.forEach(phrase => {
                        importantPhrases.push(phrase.text)
                    });
                }
            }

            if (transcript.data.sentiment_analysis_results) {
                if (transcript.data.sentiment_analysis_results.length > 0) {
                    transcript.data.sentiment_analysis_results.forEach(sentiment => {
                        if (sentiment.sentiment == "POSITIVE") {
                            sentimentCount.positive++;
                        } else if (sentiment.sentiment == "NEGATIVE") {
                            sentimentCount.negative++;
                        } else if (sentiment.sentiment == "NEUTRAL") {
                            sentimentCount.neutral++;
                        }
                    });
                }
            }

            if (transcript.data.entities) {
                if (transcript.data.entities.length > 0) {
                    transcript.data.entities.forEach(entity => {
                        entityDetection.push({ entity_type: entity.entity_type, text: entity.text })
                    });
                }
            }

            if (transcript.data.utterances) {
                if (transcript.data.utterances.length > 0) {
                    transcript.data.utterances.forEach(utterance => {
                        textWithSpeakerLabels.push({ speaker: utterance.speaker, text: utterance.text })
                    });
                }
            }

            if (transcript.data.utterances) {
                if (transcript.data.utterances.length > 0) {
                    transcript.data.utterances.forEach(utterance => {
                        textWithDualChannel.push({ channel: utterance.channel, text: utterance.text })
                    });
                }
            }

            res.send({
                status: 200,
                transcript: transcriptText,
                summary: summary,
                autoChapters: autoChapters,
                topics: topicDetection,
                contentModeration: contentModeration,
                phrases: importantPhrases,
                sentiment: sentimentCount,
                entities: entityDetection,
                speakerLabels: textWithSpeakerLabels,
                dualChannel: textWithDualChannel
            })
        }
    }, 3000)
});

function insertSpaces(string) {
    string = string.replace(/([a-z])([A-Z])/g, '$1 $2');
    string = string.replace(/([A-Z])([A-Z][a-z])/g, '$1 $2');
    return string;
}

// GET method for homepage
router.get("/", (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.render(getAbsolutePath() + '/views/index.html', { user: "Hello" });
});

//GET method for text to image page
router.get("/text-to-image", (req, res) => {
    res.render(getAbsolutePath() + '/views/text-to-image.html');
});

//GET method for speech to text page
router.get("/speech-to-text", (req, res) => {
    res.render(getAbsolutePath() + '/views/speech-to-text.html');
});

//GET method for choose ai modals page
router.get("/ai-modals/:mimeType/:type/:id", (req, res) => {
    res.render(getAbsolutePath() + '/views/modals-chooser.html', { mimeType: req.params.mimeType, type: req.params.type, id: req.params.id });
});

// GET method for showing progress & results of summarize page
router.get("/summarize/:mimeType/:type/:id", (req, res) => {
    res.render(getAbsolutePath() + '/views/summarize.html', { mimeType: req.params.mimeType, type: req.params.type, id: req.params.id, modals: req.query.modals });
});

// Exporting Routes
module.exports = {
    routes: router
};
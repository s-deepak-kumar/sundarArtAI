from flask import Flask, jsonify, request
from flask_cors import CORS
import json
import os
import io
import warnings
from PIL import Image
from stability_sdk import client
import stability_sdk.interfaces.gooseai.generation.generation_pb2 as generation
import youtube_dl
import uuid
from dotenv import load_dotenv

app = Flask(__name__)
CORS(app)

load_dotenv()

ydl_opts = {
   'format': 'bestaudio/best',
   'postprocessors': [{
       'key': 'FFmpegExtractAudio',
       'preferredcodec': 'mp3',
       'preferredquality': '192',
   }],
   'ffmpeg-location': './',
   'outtmpl': "../assets/uploads/%(id)s.%(ext)s",
}
 
@app.route("/youtube-mp3", methods=['POST'])
def youtubeMP3():
   # Retrieve POST value
   request_data = request.get_json()
   link = request_data['url']
   _id = link.strip()
   meta = youtube_dl.YoutubeDL(ydl_opts).extract_info(_id)
   save_location = "../assets/uploads/"+meta['id'] + ".mp3"
   print(save_location)
   data = {
        "status": 200,
        "location": save_location,
        "id": meta['id'],
        "type": "mp3"
    }
   return jsonify(data)

# Our Host URL should not be prepended with "https" nor should it have a trailing slash.
os.environ['STABILITY_HOST'] = 'grpc.stability.ai:443'

os.environ['STABILITY_KEY'] = os.getenv('STABILITY_KEY')

# Set up our connection to the API.
stability_api = client.StabilityInference(
    key=os.environ['STABILITY_KEY'], # API Key reference.
    verbose=True, # Print debug messages.
    engine="stable-diffusion-v1-5", # Set the engine to use for generation. 
)

# Generate text to image
@app.route("/")
def helloWord():
    return "Hello World!"

# Generate text to image
@app.route("/text-to-image", methods=['POST'])
def textToImage():
    # Retrieve POST value
    request_data = request.get_json()
    prompt = request_data['prompt']
    width = request_data['width']
    height = request_data['height']
    sampler = request_data['sampler']
    output = request_data['output']

    finalSampler = generation.SAMPLER_K_DPMPP_2M
    if sampler == "ddim":
        finalSampler = generation.SAMPLER_DDIM
    elif sampler == "k_euler":
        finalSampler = generation.SAMPLER_K_EULER
    elif sampler == "k_euler_ancestral":
        finalSampler = generation.SAMPLER_K_EULER_ANCESTRAL
    elif sampler == "k_heun":
        finalSampler = generation.SAMPLER_K_HEUN
    elif sampler == "k_dpm_2":
        finalSampler = generation.SAMPLER_K_DPM_2
    elif sampler == "k_dpm_2_ancestral":
        finalSampler = generation.SAMPLER_K_DPM_2_ANCESTRAL
    elif sampler == "k_dpmpp_2s_ancestral":
        finalSampler = generation.SAMPLER_K_DPMPP_2S_ANCESTRAL
    elif sampler == "k_lms":
        finalSampler = generation.SAMPLER_K_LMS
    elif sampler == "k_dpmpp_2m":
        finalSampler = generation.SAMPLER_K_DPMPP_2M

    # Set up our initial generation parameters.
    answers = stability_api.generate(
    prompt=prompt,
    seed=992446758,
    steps=30,
    cfg_scale=8.0,
    width=width, 
    height=height,
    samples=output, 
    sampler=finalSampler
    )

    # Set up our warning to print to the console if the adult content classifier is tripped.
    # If adult content classifier is not tripped, save generated images.
    outputList = []
    for resp in answers:
        for artifact in resp.artifacts:
            if artifact.finish_reason == generation.FILTER:
                warnings.warn(
                    "Your request activated the API's safety filters and could not be processed."
                    "Please modify the prompt and try again."
                )
            if artifact.type == generation.ARTIFACT_IMAGE:
                img = Image.open(io.BytesIO(artifact.binary))
                randomFileName = str(uuid.uuid4())
                str1 = randomFileName+ '.png'
                img.save("../assets/uploads/text-to-image/" + randomFileName+ ".png") # Save our generated images with their seed number as the filename.
                outputList.append(str1)
    data = {
        "status": 200,
        "prompt": prompt,
        "outputs": outputList
    }
    return jsonify(data)

# Generate image to image
@app.route("/image-to-image", methods=['POST'])
def imageToImage():
    # Retrieve POST value
    request_data = request.get_json()
    prompt = request_data['prompt']
    width = request_data['width']
    height = request_data['height']
    sampler = request_data['sampler']
    output = request_data['output']
    imgPath = request_data['imagePath']
    img = Image.open('../assets/uploads/' + imgPath)

    finalSampler = generation.SAMPLER_K_DPMPP_2M
    if sampler == "ddim":
        finalSampler = generation.SAMPLER_DDIM
    elif sampler == "k_euler":
        finalSampler = generation.SAMPLER_K_EULER
    elif sampler == "k_euler_ancestral":
        finalSampler = generation.SAMPLER_K_EULER_ANCESTRAL
    elif sampler == "k_heun":
        finalSampler = generation.SAMPLER_K_HEUN
    elif sampler == "k_dpm_2":
        finalSampler = generation.SAMPLER_K_DPM_2
    elif sampler == "k_dpm_2_ancestral":
        finalSampler = generation.SAMPLER_K_DPM_2_ANCESTRAL
    elif sampler == "k_dpmpp_2s_ancestral":
        finalSampler = generation.SAMPLER_K_DPMPP_2S_ANCESTRAL
    elif sampler == "k_lms":
        finalSampler = generation.SAMPLER_K_LMS
    elif sampler == "k_dpmpp_2m":
        finalSampler = generation.SAMPLER_K_DPMPP_2M

    try:
        # Set up our initial generation parameters.
        answers = stability_api.generate(
        prompt=prompt,
        init_image=img,
        start_schedule=0.6,
        seed=992446758,
        steps=30,
        cfg_scale=8.0,
        width=width, 
        height=height,
        samples=output, 
        sampler=finalSampler
        )

        # Set up our warning to print to the console if the adult content classifier is tripped.
        # If adult content classifier is not tripped, save generated images.
        outputList = []
        for resp in answers:
            for artifact in resp.artifacts:
                if artifact.finish_reason == generation.FILTER:
                    warnings.warn(
                        "Your request activated the API's safety filters and could not be processed."
                        "Please modify the prompt and try again."
                    )
                if artifact.type == generation.ARTIFACT_IMAGE:
                    img = Image.open(io.BytesIO(artifact.binary))
                    randomFileName = str(uuid.uuid4())
                    str1 = randomFileName+ '.png'
                    img.save("../assets/uploads/text-to-image/" + randomFileName+ ".png") # Save our generated images with their seed number as the filename.
                    outputList.append(str1)
                data = {
                    "status": 200,
                    "prompt": prompt,
                    "outputs": outputList
                }
        return jsonify(data)
    except Exception:
        data = {
            "status": 400
        }
        return jsonify(data)
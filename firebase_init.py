import firebase_admin
from firebase_admin import credentials, db
import json
from config import FIREBASE_CONFIG_JSON, FIREBASE_DATABASE_URL

cred_dict = json.loads(FIREBASE_CONFIG_JSON)
cred = credentials.Certificate(cred_dict)
firebase_admin.initialize_app(cred, {
    'databaseURL': FIREBASE_DATABASE_URL
})

realtime_db = db.reference()
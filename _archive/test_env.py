import os
from dotenv import load_dotenv

load_dotenv('../.env')
token = os.getenv("MOTHERDUCK_TOKEN", "")
print(f"Token Length: {len(token)}")
if len(token) > 10:
    print(f"Token starts with: {token[:5]}...")
else:
    print("Token is MISSING or too short!")

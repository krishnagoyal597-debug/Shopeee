import os
import random
import string
from typing import Optional
from datetime import datetime, timezone
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx

# Load environment variables from project .env file in parent directory
env_path = os.path.join(os.path.dirname(__file__), '../.env')
load_dotenv(dotenv_path=env_path)

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("VITE_SUPABASE_ANON_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Missing Supabase credentials. Check your parent .env file.")

app = FastAPI(title="Family Grocery Backend (HTTPX)", version="1.0.0")

# Enable CORS for the Vite frontend
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic Schemas
class CreateFamilyBody(BaseModel):
    name: str
    whatsapp_phone: Optional[str] = None

class UpdateFamilyBody(BaseModel):
    name: Optional[str] = None
    whatsapp_phone: Optional[str] = None

class JoinFamilyBody(BaseModel):
    code: str

class CreateItemBody(BaseModel):
    name: str
    quantity: str
    category: str
    family_id: str
    added_by_name: str

class ToggleItemBody(BaseModel):
    checked: bool

class AuthUser(BaseModel):
    user_id: str
    token: str

# Helper to construct database headers
def get_db_headers(token: str, prefer_representation: bool = False) -> dict:
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "application/json"
    }
    if prefer_representation:
        headers["Prefer"] = "return=representation"
    return headers

# Dependency to check Bearer token and get user context from Supabase Auth
async def get_current_user(authorization: Optional[str] = Header(None)) -> AuthUser:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    token = authorization.split(" ")[1]
    
    # Verify the token by calling Supabase Auth service
    auth_url = f"{SUPABASE_URL}/auth/v1/user"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {token}"
    }
    
    async with httpx.AsyncClient() as client:
        try:
            res = await client.get(auth_url, headers=headers)
            if res.status_code != 200:
                raise HTTPException(status_code=401, detail="Session expired or invalid")
            user_data = res.json()
            return AuthUser(user_id=user_data["id"], token=token)
        except Exception as e:
            if isinstance(e, HTTPException):
                raise e
            raise HTTPException(status_code=401, detail=f"Authentication failed: {str(e)}")

def generate_family_code() -> str:
    chars = string.ascii_uppercase + string.digits
    return "FAM-" + "".join(random.choice(chars) for _ in range(6))

# API Endpoints

@app.get("/api/profiles/me")
async def get_profile(current_user: AuthUser = Depends(get_current_user)):
    url = f"{SUPABASE_URL}/rest/v1/profiles"
    headers = get_db_headers(current_user.token)
    params = {"id": f"eq.{current_user.user_id}", "select": "*"}
    
    async with httpx.AsyncClient() as client:
        try:
            res = await client.get(url, headers=headers, params=params)
            if res.status_code != 200:
                raise HTTPException(status_code=res.status_code, detail=res.text)
            data = res.json()
            if not data:
                # PROFILE NOT FOUND. Let's self-heal and create one!
                auth_res = await client.get(f"{SUPABASE_URL}/auth/v1/user", headers=headers)
                display_name = "Family Member"
                if auth_res.status_code == 200:
                    user_info = auth_res.json()
                    # Try display_name from metadata, then phone number, then fallback
                    display_name = (
                        user_info.get("user_metadata", {}).get("display_name")
                        or user_info.get("phone")
                        or "Family Member"
                    )
                
                # Insert profile
                headers_write = get_db_headers(current_user.token, prefer_representation=True)
                insert_payload = {
                    "id": current_user.user_id,
                    "display_name": display_name,
                    "role": "member",
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
                insert_res = await client.post(url, headers=headers_write, json=insert_payload)
                if insert_res.status_code not in (200, 201):
                    raise HTTPException(status_code=insert_res.status_code, detail=f"Failed to auto-create profile: {insert_res.text}")
                return insert_res.json()[0]
            return data[0]
        except Exception as e:
            if isinstance(e, HTTPException):
                raise e
            raise HTTPException(status_code=500, detail=str(e))

class UpdateProfileBody(BaseModel):
    display_name: Optional[str] = None

@app.patch("/api/profiles/me")
async def update_profile(body: UpdateProfileBody, current_user: AuthUser = Depends(get_current_user)):
    url = f"{SUPABASE_URL}/rest/v1/profiles"
    headers = get_db_headers(current_user.token, prefer_representation=True)
    params = {"id": f"eq.{current_user.user_id}"}
    
    payload = {}
    if body.display_name is not None:
        payload["display_name"] = body.display_name.strip()
    
    if not payload:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    payload["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    async with httpx.AsyncClient() as client:
        try:
            res = await client.patch(url, headers=headers, json=payload, params=params)
            if res.status_code not in (200, 201, 204):
                raise HTTPException(status_code=res.status_code, detail=res.text)
            data = res.json()
            if not data:
                raise HTTPException(status_code=404, detail="Profile not found")
            return data[0]
        except Exception as e:
            if isinstance(e, HTTPException):
                raise e
            raise HTTPException(status_code=500, detail=f"Error updating profile: {str(e)}")

@app.post("/api/families")
async def create_family(body: CreateFamilyBody, current_user: AuthUser = Depends(get_current_user)):
    fam_url = f"{SUPABASE_URL}/rest/v1/families"
    prof_url = f"{SUPABASE_URL}/rest/v1/profiles"
    code = generate_family_code()
    
    async with httpx.AsyncClient() as client:
        try:
            # 1. Create family in families table
            headers = get_db_headers(current_user.token, prefer_representation=True)
            fam_payload = {
                "name": body.name.strip(),
                "code": code,
                "created_by": current_user.user_id,
                "whatsapp_phone": body.whatsapp_phone.strip() if body.whatsapp_phone else None
            }
            fam_res = await client.post(fam_url, headers=headers, json=fam_payload)
            if fam_res.status_code not in (200, 201):
                raise HTTPException(status_code=fam_res.status_code, detail=fam_res.text)
            
            family = fam_res.json()[0]
            
            # 2. Update user profile to link to family
            prof_payload = {
                "family_id": family["id"],
                "role": "admin",
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
            prof_params = {"id": f"eq.{current_user.user_id}"}
            prof_res = await client.patch(prof_url, headers=headers, json=prof_payload, params=prof_params)
            if prof_res.status_code not in (200, 201, 204):
                raise HTTPException(status_code=prof_res.status_code, detail=prof_res.text)
            
            return family
        except Exception as e:
            if isinstance(e, HTTPException):
                raise e
            raise HTTPException(status_code=500, detail=f"Error creating family: {str(e)}")

@app.post("/api/families/join")
async def join_family(body: JoinFamilyBody, current_user: AuthUser = Depends(get_current_user)):
    fam_url = f"{SUPABASE_URL}/rest/v1/families"
    prof_url = f"{SUPABASE_URL}/rest/v1/profiles"
    formatted_code = body.code.upper().strip()
    
    async with httpx.AsyncClient() as client:
        try:
            # 1. Locate the family by code
            headers = get_db_headers(current_user.token)
            fam_params = {"code": f"eq.{formatted_code}", "select": "*"}
            fam_res = await client.get(fam_url, headers=headers, params=fam_params)
            if fam_res.status_code != 200:
                raise HTTPException(status_code=fam_res.status_code, detail=fam_res.text)
            
            families = fam_res.json()
            if not families:
                raise HTTPException(status_code=404, detail="Family group not found with this code.")
            
            family = families[0]
            
            # 2. Link profile to the family
            headers_write = get_db_headers(current_user.token, prefer_representation=True)
            prof_payload = {
                "family_id": family["id"],
                "role": "member",
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
            prof_params = {"id": f"eq.{current_user.user_id}"}
            prof_res = await client.patch(prof_url, headers=headers_write, json=prof_payload, params=prof_params)
            if prof_res.status_code not in (200, 201, 204):
                raise HTTPException(status_code=prof_res.status_code, detail=prof_res.text)
            
            return prof_res.json()[0]
        except Exception as e:
            if isinstance(e, HTTPException):
                raise e
            raise HTTPException(status_code=500, detail=f"Error joining family: {str(e)}")

@app.get("/api/families/{family_id}")
async def get_family(family_id: str, current_user: AuthUser = Depends(get_current_user)):
    url = f"{SUPABASE_URL}/rest/v1/families"
    headers = get_db_headers(current_user.token)
    params = {"id": f"eq.{family_id}", "select": "*"}
    
    async with httpx.AsyncClient() as client:
        try:
            res = await client.get(url, headers=headers, params=params)
            if res.status_code != 200:
                raise HTTPException(status_code=res.status_code, detail=res.text)
            data = res.json()
            if not data:
                raise HTTPException(status_code=404, detail="Family not found")
            return data[0]
        except Exception as e:
            if isinstance(e, HTTPException):
                raise e
            raise HTTPException(status_code=500, detail=str(e))

@app.patch("/api/families/{family_id}")
async def update_family(family_id: str, body: UpdateFamilyBody, current_user: AuthUser = Depends(get_current_user)):
    url = f"{SUPABASE_URL}/rest/v1/families"
    headers = get_db_headers(current_user.token, prefer_representation=True)
    params = {"id": f"eq.{family_id}"}
    
    payload = {}
    if body.name is not None:
        payload["name"] = body.name.strip()
    if body.whatsapp_phone is not None:
        payload["whatsapp_phone"] = body.whatsapp_phone.strip() if body.whatsapp_phone.strip() else None
        
    if not payload:
        raise HTTPException(status_code=400, detail="No fields to update")
        
    async with httpx.AsyncClient() as client:
        try:
            res = await client.patch(url, headers=headers, json=payload, params=params)
            if res.status_code not in (200, 201, 204):
                raise HTTPException(status_code=res.status_code, detail=res.text)
            data = res.json()
            if not data:
                raise HTTPException(status_code=404, detail="Family not found or unauthorized")
            return data[0]
        except Exception as e:
            if isinstance(e, HTTPException):
                raise e
            raise HTTPException(status_code=500, detail=f"Error updating family: {str(e)}")

@app.get("/api/items")
async def get_items(current_user: AuthUser = Depends(get_current_user)):
    url = f"{SUPABASE_URL}/rest/v1/grocery_items"
    headers = get_db_headers(current_user.token)
    # Filter ordering checked ASC, created_at DESC
    params = {
        "select": "*",
        "order": "checked.asc,created_at.desc"
    }
    
    async with httpx.AsyncClient() as client:
        try:
            res = await client.get(url, headers=headers, params=params)
            if res.status_code != 200:
                raise HTTPException(status_code=res.status_code, detail=res.text)
            return res.json()
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error fetching grocery items: {str(e)}")

@app.post("/api/items")
async def create_item(body: CreateItemBody, current_user: AuthUser = Depends(get_current_user)):
    url = f"{SUPABASE_URL}/rest/v1/grocery_items"
    headers = get_db_headers(current_user.token, prefer_representation=True)
    payload = {
        "family_id": body.family_id,
        "name": body.name.strip(),
        "quantity": body.quantity.strip(),
        "category": body.category,
        "added_by": current_user.user_id,
        "added_by_name": body.added_by_name,
        "checked": False
    }
    
    async with httpx.AsyncClient() as client:
        try:
            res = await client.post(url, headers=headers, json=payload)
            if res.status_code not in (200, 201):
                raise HTTPException(status_code=res.status_code, detail=res.text)
            return res.json()[0]
        except Exception as e:
            if isinstance(e, HTTPException):
                raise e
            raise HTTPException(status_code=500, detail=f"Error creating item: {str(e)}")

@app.put("/api/items/{item_id}/toggle")
async def toggle_item(item_id: str, body: ToggleItemBody, current_user: AuthUser = Depends(get_current_user)):
    url = f"{SUPABASE_URL}/rest/v1/grocery_items"
    headers = get_db_headers(current_user.token, prefer_representation=True)
    payload = {"checked": body.checked}
    params = {"id": f"eq.{item_id}"}
    
    async with httpx.AsyncClient() as client:
        try:
            res = await client.patch(url, headers=headers, json=payload, params=params)
            if res.status_code not in (200, 201, 204):
                raise HTTPException(status_code=res.status_code, detail=res.text)
            data = res.json()
            if not data:
                raise HTTPException(status_code=404, detail="Item not found or unauthorized.")
            return data[0]
        except Exception as e:
            if isinstance(e, HTTPException):
                raise e
            raise HTTPException(status_code=500, detail=f"Error toggling item: {str(e)}")

@app.delete("/api/items/{item_id}")
async def delete_item(item_id: str, current_user: AuthUser = Depends(get_current_user)):
    url = f"{SUPABASE_URL}/rest/v1/grocery_items"
    headers = get_db_headers(current_user.token)
    params = {"id": f"eq.{item_id}"}
    
    async with httpx.AsyncClient() as client:
        try:
            res = await client.delete(url, headers=headers, params=params)
            if res.status_code not in (200, 204):
                raise HTTPException(status_code=res.status_code, detail=res.text)
            return {"success": True}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error deleting item: {str(e)}")

@app.delete("/api/items/completed/{family_id}")
async def delete_completed_items(family_id: str, current_user: AuthUser = Depends(get_current_user)):
    url = f"{SUPABASE_URL}/rest/v1/grocery_items"
    headers = get_db_headers(current_user.token)
    params = {"family_id": f"eq.{family_id}", "checked": "is.true"}
    
    async with httpx.AsyncClient() as client:
        try:
            res = await client.delete(url, headers=headers, params=params)
            if res.status_code not in (200, 204):
                raise HTTPException(status_code=res.status_code, detail=res.text)
            return {"success": True}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error clearing completed items: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)

"""Guardian API foundation. Local setup only, not exposed by the public demo.
Use PostgreSQL for production. All writes require identity, role and version checks.
"""
import os, json, hashlib, hmac, secrets
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from pathlib import Path
from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
from sqlalchemy import create_engine, text
from sqlalchemy.pool import StaticPool

DB_URL = os.environ.get('DATABASE_URL', 'sqlite:///./guardflow.db')
kwargs = {'connect_args': {'check_same_thread': False}} if DB_URL.startswith('sqlite') else {}
engine = create_engine(DB_URL, **kwargs)
app = FastAPI(title='Guardian API foundation', version='0.1.0')
auth = HTTPBearer()

def now(): return datetime.now(timezone.utc)
def digest(token): return hashlib.sha256(token.encode()).hexdigest()
def password_hash(password, salt): return hashlib.scrypt(password.encode(),salt=bytes.fromhex(salt),n=16384,r=8,p=1).hex()

def init_db():
    with engine.begin() as c:
        for sql in [
            'CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL, sites TEXT NOT NULL, employee_id TEXT, salt TEXT NOT NULL, password TEXT NOT NULL)',
            'CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires TEXT NOT NULL)',
            'CREATE TABLE IF NOT EXISTS shifts (id TEXT PRIMARY KEY, site_id TEXT NOT NULL, day TEXT NOT NULL, period TEXT NOT NULL, version INTEGER NOT NULL, data TEXT NOT NULL)',
            'CREATE TABLE IF NOT EXISTS audit (id TEXT PRIMARY KEY, at TEXT NOT NULL, user_id TEXT NOT NULL, shift_id TEXT NOT NULL, action TEXT NOT NULL, details TEXT NOT NULL)',
            'CREATE TABLE IF NOT EXISTS alerts (id TEXT PRIMARY KEY, at TEXT NOT NULL, shift_id TEXT NOT NULL, audience TEXT NOT NULL, message TEXT NOT NULL, delivery TEXT NOT NULL)',
            'CREATE TABLE IF NOT EXISTS login_attempts (id TEXT PRIMARY KEY, at TEXT NOT NULL, username TEXT NOT NULL)'
        ]: c.execute(text(sql))
init_db()

class Login(BaseModel):
    username: str = Field(min_length=1,max_length=80)
    password: str = Field(min_length=1,max_length=200)

@app.post('/api/login')
def login(body: Login):
    with engine.begin() as c:
        cutoff=(now()-timedelta(minutes=15)).isoformat()
        count=c.execute(text('SELECT COUNT(*) FROM login_attempts WHERE username=:u AND at>:t'),{'u':body.username,'t':cutoff}).scalar()
        if count>=5: raise HTTPException(429,'Too many attempts. Wait 15 minutes.')
        c.execute(text('INSERT INTO login_attempts VALUES (:id,:at,:u)'),{'id':secrets.token_hex(16),'at':now().isoformat(),'u':body.username})
        c.commit()
    with engine.begin() as c:
        row=c.execute(text('SELECT * FROM users WHERE id=:id'),{'id':body.username}).mappings().first()
        if not row or not hmac.compare_digest(password_hash(body.password,row['salt']),row['password']): raise HTTPException(401,'Invalid credentials')
        token=secrets.token_urlsafe(32)
        c.execute(text('INSERT INTO sessions VALUES (:token,:uid,:exp)'),{'token':digest(token),'uid':row['id'],'exp':(now()+timedelta(hours=8)).isoformat()})
        return {'token':token,'expires_in':28800,'role':row['role'],'name':row['name']}

def user(credentials: HTTPAuthorizationCredentials=Depends(auth)):
    with engine.connect() as c:
        row=c.execute(text('SELECT u.*,s.expires FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=:t'),{'t':digest(credentials.credentials)}).mappings().first()
    if not row or datetime.fromisoformat(row['expires'])<now(): raise HTTPException(401,'Session expired')
    return dict(row)

def scope(u,site,write=False):
    if u['role']=='owner': return
    if write and u['role']=='employee': raise HTTPException(403,'Employee read-only')
    if site not in json.loads(u['sites']): raise HTTPException(403,'Site access denied')

def load(c,sid,u,write=False):
    row=c.execute(text('SELECT * FROM shifts WHERE id=:id'),{'id':sid}).mappings().first()
    if not row: raise HTTPException(404,'Shift not found')
    scope(u,row['site_id'],write)
    return dict(row),json.loads(row['data'])

def audit(c,u,sid,action,details):
    c.execute(text('INSERT INTO audit VALUES (:id,:at,:u,:s,:a,:d)'),{'id':secrets.token_hex(16),'at':now().isoformat(),'u':u['id'],'s':sid,'a':action,'d':json.dumps(details)})

def save(c,row,data,version,u,action,details):
    result=c.execute(text('UPDATE shifts SET data=:d,version=version+1 WHERE id=:id AND version=:v'),{'d':json.dumps(data),'id':row['id'],'v':version})
    if result.rowcount!=1: raise HTTPException(409,'Shift changed on another device. Reload before saving.')
    audit(c,u,row['id'],action,details)
    return {'version':version+1,'data':data}

@app.get('/api/health')
def health(): return {'status':'ok','stage':'foundation, not production-certified'}

@app.get('/api/shifts/{sid}')
def get_shift(sid:str,u=Depends(user)):
    with engine.connect() as c: row,data=load(c,sid,u)
    if u['role']=='employee':
        data={'slots':[s for s in data['slots'] if s['employee_id']==u['employee_id']]}
    return {'id':sid,'version':row['version'],'data':data}

class Attendance(BaseModel):
    version:int=Field(ge=1)
    status:str=Field(pattern='^(present|absent|pending)$')
    reason:str=Field(min_length=3,max_length=300)
    reference:str=Field(min_length=2,max_length=150)

@app.patch('/api/shifts/{sid}/slots/{slot_id}')
def mark(sid:str,slot_id:str,body:Attendance,u=Depends(user)):
    with engine.begin() as c:
        row,data=load(c,sid,u,True)
        if data.get('closed'): raise HTTPException(409,'Closed shift: use an approved adjustment workflow')
        slot=next((s for s in data['slots'] if s['id']==slot_id),None)
        if not slot: raise HTTPException(404,'Slot not found')
        old=slot['status'];slot['status']=body.status;data['register']['reviewed']=False
        return save(c,row,data,body.version,u,'attendance',{'slot':slot_id,'old':old,**body.model_dump()})

class Replacement(BaseModel):
    version:int=Field(ge=1)
    employee_id:str=Field(min_length=1,max_length=80)
    name:str=Field(min_length=1,max_length=80)
    rate_paise:int=Field(ge=0,le=5000000)
    reason:str=Field(min_length=3,max_length=300)
    reference:str=Field(min_length=2,max_length=150)

@app.post('/api/shifts/{sid}/slots/{slot_id}/replacement')
def replacement(sid:str,slot_id:str,body:Replacement,u=Depends(user)):
    if u['role'] not in ('owner','officer'): raise HTTPException(403,'Owner or field officer required')
    with engine.begin() as c:
        row,data=load(c,sid,u,True)
        if data.get('closed'): raise HTTPException(409,'Shift is closed')
        # Cross-site collision check in the same date/period. PostgreSQL transactions
        # should use SERIALIZABLE isolation for deployment to reject concurrent assignments.
        others=c.execute(text('SELECT data FROM shifts WHERE day=:d AND period=:p'),{'d':row['day'],'p':row['period']}).scalars()
        for other in others:
            if any(s['employee_id']==body.employee_id and s['status']=='present' for s in json.loads(other)['slots']): raise HTTPException(409,'Guard already on duty in this period')
        slot=next((s for s in data['slots'] if s['id']==slot_id),None)
        if not slot: raise HTTPException(404,'Slot not found')
        original=dict(slot)
        slot.update(employee_id=body.employee_id,name=body.name,rate_paise=body.rate_paise,status='present')
        slot['replacement_history']=slot.get('replacement_history',[])+[{'original':original,'reason':body.reason,'reference':body.reference}]
        data['register']['reviewed']=False
        return save(c,row,data,body.version,u,'replacement',body.model_dump())

class Register(BaseModel):
    version:int=Field(ge=1)
    count:int=Field(ge=0,le=500)
    reference:str=Field(min_length=2,max_length=150)
    evidence_id:str=Field(min_length=5,max_length=200)

@app.post('/api/shifts/{sid}/register')
def check_register(sid:str,body:Register,u=Depends(user)):
    with engine.begin() as c:
        row,data=load(c,sid,u,True)
        if data.get('closed'): raise HTTPException(409,'Shift is closed')
        named=sum(s['status']=='present' for s in data['slots'])
        data['register']={'count':body.count,'reference':body.reference,'evidence_id':body.evidence_id,'reviewed':named==body.count}
        if named!=body.count:
            c.execute(text('INSERT INTO alerts VALUES (:id,:at,:s,:a,:m,:d)'),{'id':secrets.token_hex(16),'at':now().isoformat(),'s':sid,'a':'owner,officer,affected_employee','m':f'{named} named vs {body.count} register','d':'pending: outbound delivery not configured'})
        return save(c,row,data,body.version,u,'register',body.model_dump())

@app.get('/api/shifts/{sid}/totals')
def totals(sid:str,u=Depends(user)):
    with engine.connect() as c: row,data=load(c,sid,u)
    served=[s for s in data['slots'] if s['status']=='present']
    if u['role']=='employee': return {'earned_paise':sum(s['rate_paise'] for s in served if s['employee_id']==u['employee_id']),'provisional':not data.get('closed',False)}
    if u['role']!='owner': raise HTTPException(403,'Owner required for financial totals')
    register=data['register'];matched=register['count']==len(served) and register.get('reviewed')
    return {'payroll_paise':sum(s['rate_paise'] for s in served),'billable_guard_shifts':register['count'],'service_value_paise':register['count']*data['billing_rate_paise'],'can_close':bool(matched and register.get('evidence_id')),'tax_configured':False,'invoice_finalisation_enabled':False}

@app.get('/api/shifts/{sid}/audit')
def get_audit(sid:str,u=Depends(user)):
    if u['role']=='employee': raise HTTPException(403,'Audit access denied')
    with engine.connect() as c:
        load(c,sid,u)
        return [dict(r) for r in c.execute(text('SELECT * FROM audit WHERE shift_id=:s ORDER BY at DESC'),{'s':sid}).mappings()]

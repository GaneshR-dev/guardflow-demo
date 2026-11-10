import os,sys,tempfile,json,secrets
os.environ['DATABASE_URL']='sqlite:///'+tempfile.mktemp(suffix='.db')
sys.path.insert(0,os.path.join(os.path.dirname(__file__),'..','backend'))
from app import app,engine,text,password_hash
from fastapi.testclient import TestClient
client=TestClient(app)
def setup_module():
 with engine.begin() as c:
  for uid,role,sites in [('owner','owner',[]),('officer','officer',['site-a']),('other','officer',['site-b']),('employee','employee',['site-a'])]:
   salt=secrets.token_hex(16);c.execute(text('INSERT INTO users VALUES (:id,:name,:role,:sites,:e,:salt,:pw)'),dict(id=uid,name=uid,role=role,sites=json.dumps(sites),e='G1',salt=salt,pw=password_hash('test-password-only',salt)))
  data={'slots':[{'id':'p1','employee_id':'G1','name':'Demo Guard','rate_paise':65000,'status':'absent'}],'register':{'count':1,'reviewed':False},'billing_rate_paise':95000}
  c.execute(text('INSERT INTO shifts VALUES (:id,:s,:d,:p,:v,:data)'),dict(id='a-day',s='site-a',d='2026-10-22',p='day',v=1,data=json.dumps(data)))
def token(uid):return {'Authorization':'Bearer '+client.post('/api/login',json={'username':uid,'password':'test-password-only'}).json()['token']}
def test_auth_and_scope():
 assert client.get('/api/shifts/a-day').status_code==401
 assert client.get('/api/shifts/a-day',headers=token('other')).status_code==403
 assert client.patch('/api/shifts/a-day/slots/p1',headers=token('employee'),json={'version':1,'status':'present','reason':'Checked paper','reference':'Page 3'}).status_code==403

def test_write_conflict_reconcile_and_pay():
 h=token('owner');body={'version':1,'status':'present','reason':'Checked paper','reference':'Page 3'}
 assert client.patch('/api/shifts/a-day/slots/p1',headers=h,json=body).status_code==200
 assert client.patch('/api/shifts/a-day/slots/p1',headers=h,json=body).status_code==409
 totals=client.get('/api/shifts/a-day/totals',headers=h).json();assert totals['payroll_paise']==65000 and not totals['can_close']
 assert client.post('/api/shifts/a-day/register',headers=h,json={'version':2,'count':1,'reference':'Page 3','evidence_id':'evidence-demo-1'}).status_code==200
 assert client.get('/api/shifts/a-day/totals',headers=h).json()['can_close']
 assert len(client.get('/api/shifts/a-day/audit',headers=h).json())==2

def test_employee_private_totals():
 d=client.get('/api/shifts/a-day',headers=token('employee')).json();assert 'register' not in d['data']
 assert client.get('/api/shifts/a-day/audit',headers=token('employee')).status_code==403

def test_login_limits():
 for _ in range(5):client.post('/api/login',json={'username':'missing','password':'wrong'})
 assert client.post('/api/login',json={'username':'missing','password':'wrong'}).status_code==429

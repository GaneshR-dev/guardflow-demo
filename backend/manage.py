"""Local admin bootstrap. Password collected at terminal, never committed."""
import getpass,secrets,json,sys
from app import engine,text,password_hash,init_db
if __name__=='__main__':
    init_db();uid=input('Owner username: ').strip();name=input('Display name: ').strip();pw=getpass.getpass('Password (12+ characters): ')
    if len(pw)<12:sys.exit('Use at least 12 characters.')
    salt=secrets.token_hex(16)
    with engine.begin() as c:c.execute(text('INSERT INTO users VALUES (:id,:name,:role,:sites,:e,:salt,:password)'),{'id':uid,'name':name,'role':'owner','sites':'[]','e':None,'salt':salt,'password':password_hash(pw,salt)})
    print('Owner created. Serve over HTTPS only.')

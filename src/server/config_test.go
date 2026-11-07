package main
import ("os";"path/filepath";"strings";"testing")
func validEnv(t *testing.T) {
 t.Helper()
 for key,value:=range map[string]string{"LAN_IP":"192.168.2.80","IP":"","START_MAP":"de_dust2","SERVER_NAME":"Taliabu CS 1.6","MAX_PLAYERS":"16","BOT_QUOTA":"8","BOT_DIFFICULTY":"2","PORT":"27018"} {t.Setenv(key,value)}
}
func TestDefaultConfiguration(t *testing.T) {
 validEnv(t);cfg,err:=loadGameConfig()
 if err!=nil||cfg.BotQuota!=8||cfg.MaxPlayers!=16||cfg.BotDifficulty!=2{t.Fatalf("unexpected config: %+v, %v",cfg,err)}
}
func TestInvalidSettings(t *testing.T){
 cases:=[]struct{key,value string}{{"LAN_IP","127.0.0.1"},{"LAN_IP",""},{"LAN_IP","0.0.0.0"},{"LAN_IP","not-an-ip"},{"START_MAP","../de_dust2"},{"START_MAP","de_dust2;quit"},{"MAX_PLAYERS","33"},{"MAX_PLAYERS","one"},{"BOT_QUOTA","16"},{"BOT_QUOTA","-1"},{"BOT_DIFFICULTY","5"},{"PORT","80"},{"SERVER_NAME","test\nquit"}}
 for _,tc:=range cases{t.Run(tc.key+tc.value,func(t *testing.T){validEnv(t);t.Setenv(tc.key,tc.value);if _,err:=loadGameConfig();err==nil{t.Fatal("unsafe setting accepted")}})}
}
func TestPrepareGame(t *testing.T){
 validEnv(t);cfg,_:=loadGameConfig();root:=t.TempDir();game:=filepath.Join(root,"cstrike")
 for _,path:=range []string{"maps/de_dust2.bsp","dlls/cs.so","addons/yapb/bin/yapb.so","addons/yapb/data/graph/de_dust2.graph","addons/yapb/conf/yapb.cfg"}{p:=filepath.Join(game,path);os.MkdirAll(filepath.Dir(p),0755);os.WriteFile(p,[]byte("test"),0644)}
 for _,file:=range []string{"liblist.gam","gameinfo.txt"}{os.WriteFile(filepath.Join(game,file),[]byte("game \"Counter Strike\"\ngamedll_linux \"dlls/cs.so\"\n"),0644)}
 if err:=prepareGame(root,cfg);err!=nil{t.Fatal(err)}
 if err:=prepareGame(root,cfg);err!=nil{t.Fatal("not idempotent:",err)}
 for _,file:=range []string{"liblist.gam","gameinfo.txt"}{data,_:=os.ReadFile(filepath.Join(game,file));if strings.Count(string(data),"addons/yapb/bin/yapb.so")!=1{t.Fatal(string(data))}}
 data,_:=os.ReadFile(filepath.Join(game,"addons/yapb/conf/yapb.cfg"));if !strings.Contains(string(data),`yb_quota "8"`)||!strings.Contains(string(data),`yb_quota_mode "fill"`){t.Fatal(string(data))}
 os.Remove(filepath.Join(game,"addons/yapb/data/graph/de_dust2.graph"));if prepareGame(root,cfg)==nil{t.Fatal("missing graph accepted")}
}

package main
import("net/http/httptest";"testing")
func TestSameOrigin(t *testing.T){
 for _,tc:=range []struct{origin string;ok bool}{{"",true},{"http://192.168.2.80:27016",true},{"https://evil.invalid",false},{"null",false},{"http://192.168.2.80:9999",false},{"http://user@192.168.2.80:27016",false}}{r:=httptest.NewRequest("GET","http://192.168.2.80:27016/websocket",nil);r.Header.Set("Origin",tc.origin);if sameOrigin(r)!=tc.ok{t.Errorf("origin %q",tc.origin)}}
}
func TestNoHiddenFilesOrTraversal(t *testing.T){
 handler:=publicFileHandler(t.TempDir())
 for _,target:=range []string{"/.env","/assets/../secret","/.git/config","/assets/"}{r:=httptest.NewRequest("GET",target,nil);w:=httptest.NewRecorder();handler.ServeHTTP(w,r);if w.Code!=404{t.Errorf("%s: %d",target,w.Code)}}
}

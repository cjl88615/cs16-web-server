package main
import("encoding/json";"net/http";"net/url";"path";"strings")
func sameOrigin(r *http.Request) bool {
 origin:=r.Header.Get("Origin");if origin==""{return true}
 parsed,err:=url.Parse(origin)
 return err==nil&&(parsed.Scheme=="http"||parsed.Scheme=="https")&&parsed.User==nil&&strings.EqualFold(parsed.Host,r.Host)
}
func publicFileHandler(root string) http.Handler {
 files:=http.FileServer(http.Dir(root))
 return http.HandlerFunc(func(w http.ResponseWriter,r *http.Request){
  w.Header().Set("X-Content-Type-Options","nosniff");w.Header().Set("Referrer-Policy","same-origin");w.Header().Set("X-Frame-Options","SAMEORIGIN")
  if r.Method!=http.MethodGet&&r.Method!=http.MethodHead{w.WriteHeader(http.StatusMethodNotAllowed);return}
  for _,part:=range strings.Split(r.URL.Path,"/"){if strings.HasPrefix(part,"."){http.NotFound(w,r);return}}
  if r.URL.Path!="/"&&strings.HasSuffix(r.URL.Path,"/"){http.NotFound(w,r);return}
  if path.Ext(r.URL.Path)==".wasm"{w.Header().Set("Content-Type","application/wasm")}
  if r.URL.Path=="/"||r.URL.Path=="/index.html"||r.URL.Path=="/gamefiles.version.json"{w.Header().Set("Cache-Control","no-cache")}
  files.ServeHTTP(w,r)
 })
}
func serverInfoHandler(w http.ResponseWriter,r *http.Request){
 if r.Method!=http.MethodGet{w.WriteHeader(http.StatusMethodNotAllowed);return}
 w.Header().Set("Content-Type","application/json; charset=utf-8");w.Header().Set("Cache-Control","no-store")
 // Configured opening map/quota, not live occupancy or the current match state.
 _=json.NewEncoder(w).Encode(gameConfig)
}

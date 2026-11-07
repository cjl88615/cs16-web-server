package main
import("fmt";"os";"runtime";"strconv";goxash3d_fwgs "github.com/yohimik/goxash3d-fwgs/pkg")
func main(){
 runtime.LockOSThread()
 cfg,err:=loadGameConfig();if err!=nil{fmt.Fprintln(os.Stderr,err);os.Exit(1)};gameConfig=cfg
 if err=prepareGame(".",cfg);err!=nil{fmt.Fprintln(os.Stderr,err);os.Exit(1)}
 os.Args=append(os.Args,"+maxplayers",strconv.Itoa(cfg.MaxPlayers),"+map",cfg.Map)
 goxash3d_fwgs.DefaultXash3D.RegisterNetCallbacks()
 // Install callbacks before the native engine starts, not in a racing goroutine.
 runSFU()
 os.Exit(goxash3d_fwgs.DefaultXash3D.SysStart())
}

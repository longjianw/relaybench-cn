on run
  set launcherPath to "__LAUNCHER_PATH__"
  set appUrl to "http://127.0.0.1:8790"

  try
    do shell script "/bin/zsh " & quoted form of launcherPath
    open location appUrl
  on error errorMessage
    display dialog "模型验真台启动失败" & return & return & errorMessage buttons {"好"} default button "好" with icon stop
  end try
end run

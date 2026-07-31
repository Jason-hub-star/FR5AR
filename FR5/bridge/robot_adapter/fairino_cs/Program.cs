// fairino-cs — 검증된 libfairino.dll(C#SDK-V1.2.4)을 JSON-lines(stdin/stdout)로 부리는
// 서브프로세스. 호출명·시그니처는 Unity LiveFairinoClient.cs 실기 검증 코드 대조다 (STACK.md §FR5 C# SDK).
// 런타임은 Unity 번들 Mono 다 — dll 이 .NET Framework 전용 API(DefineDynamicAssembly)를 써서
// 최신 dotnet 에서 안 돈다 (2026-07-31 실측). 빌드·실행은 build.sh 를 본다.
// 정책: 여기는 안전 판정을 하지 않는다 — 게이트는 전부 Python 브리지가 강제한다 (SAFETY-RULES 제2원칙).
using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Web.Script.Serialization;

static class App
{
    static Assembly sdk;
    static object robot;                 // fairino.Robot 인스턴스
    static readonly JavaScriptSerializer Json = new JavaScriptSerializer();

    static void Main()
    {
        var dllPath = Environment.GetEnvironmentVariable("FAIRINO_DLL");
        string line;
        while ((line = Console.ReadLine()) != null)
        {
            Dictionary<string, object> res;
            try
            {
                var req = Json.Deserialize<Dictionary<string, object>>(line);
                res = Dispatch((string)req["op"], req, dllPath);
            }
            catch (Exception ex)
            {
                res = Fail(-6, Root(ex).Message);
            }
            Console.WriteLine(Json.Serialize(res));
            Console.Out.Flush();
        }
    }

    static Exception Root(Exception ex)
    {
        var t = ex as TargetInvocationException;
        return t != null && t.InnerException != null ? Root(t.InnerException) : ex;
    }

    static Dictionary<string, object> Dispatch(string op, Dictionary<string, object> req, string dllPath)
    {
        switch (op)
        {
            case "connect":
            {
                if (sdk == null)
                {
                    if (string.IsNullOrEmpty(dllPath)) throw new Exception("FAIRINO_DLL 환경변수가 없다");
                    sdk = Assembly.LoadFrom(dllPath);
                }
                var type = sdk.GetType("fairino.Robot");
                if (type == null) throw new Exception("fairino.Robot 타입 없음");
                robot = Activator.CreateInstance(type);
                var code = Call("RPC", (string)req["ip"]);
                if (code != 0) { robot = null; return Fail(code, "RPC 연결 실패 code=" + code); }
                return Ok();
            }
            case "disconnect":
            {
                if (robot != null) { try { Call("CloseRPC"); } catch { /* 끊는 중 실패는 무시 */ } }
                robot = null;
                return Ok();
            }
            case "version":
            {
                Require();
                var d = Ok();
                // 인자 수는 Unity 실기 검증값 — GetSDKVersion 1 · GetSoftwareVersion 3 · GetFirmwareVersion 8
                var sdkVer = CallRefStrings("GetSDKVersion", 1);
                d["sdk"] = sdkVer.Length > 0 ? sdkVer[0] : "";
                d["software"] = CallRefStrings("GetSoftwareVersion", 3);
                d["firmware"] = CallRefStrings("GetFirmwareVersion", 8);
                return d;
            }
            case "fields":
            {
                Require();
                var pkgType = sdk.GetType("fairino.ROBOT_STATE_PKG");
                if (pkgType == null) throw new Exception("ROBOT_STATE_PKG 없음");
                var d = Ok();
                d["fields"] = pkgType.GetFields(BindingFlags.Public | BindingFlags.Instance)
                    .Select(f => f.Name + ":" + f.FieldType.Name).ToArray();
                return d;
            }
            case "sig":
            {
                Require();
                var d = Ok();
                d["sigs"] = robot.GetType().GetMethods().Where(x => x.Name == (string)req["name"])
                    .Select(x => string.Join(", ", x.GetParameters().Select(p => p.ParameterType.ToString()))).ToArray();
                return d;
            }
            case "methods":
            {
                Require();
                var d = Ok();
                d["methods"] = robot.GetType().GetMethods(BindingFlags.Public | BindingFlags.Instance)
                    .Select(m => m.Name).Distinct().OrderBy(n => n).ToArray();
                return d;
            }
            case "state": return ReadState();
            case "sample": { Require(); return Code(Call("SetRobotRealtimeStateSamplePeriod", ToInt(req["ms"]))); }
            case "enable":
            {
                Require();
                var on = ToInt(req["on"]);
                int c1;
                var code = TryCall("RobotEnable", out c1, (byte)on) ? c1 : Call("RobotEnable", on);
                if (code != 0)                    // Unity 폴백 그대로 — byte 실패면 int 오버로드 재시도
                {
                    int c2;
                    if (TryCall("RobotEnable", out c2, on) && c2 == 0) code = 0;
                }
                return Code(code);
            }
            case "reset": { Require(); return Code(Call("ResetAllError")); }
            case "mode": { Require(); return Code(Call("Mode", ToInt(req["mode"]))); }
            case "dragteach": { Require(); return Code(Call("DragTeachSwitch", (byte)ToInt(req["on"]))); }
            case "movej": return MoveJ(req);
            case "stop":
            {
                Require();
                int sc;
                if (TryCall("StopMotion", out sc)) return Code(sc);
                if (TryCall("ImmStopJOG", out sc)) return Code(sc);
                throw new Exception("정지 메서드(StopMotion/ImmStopJOG)를 못 찾았다");
            }
            default: throw new Exception("모르는 op: " + op);
        }
    }

    static void Require() { if (robot == null) throw new Exception("연결되지 않았다"); }
    static int ToInt(object o) { return Convert.ToInt32(o); }
    static Dictionary<string, object> Ok()
    {
        var d = new Dictionary<string, object>();
        d["ok"] = true;
        return d;
    }
    static Dictionary<string, object> Fail(int code, string error)
    {
        var d = new Dictionary<string, object>();
        d["ok"] = false;
        d["code"] = code;
        d["error"] = error;
        return d;
    }
    static Dictionary<string, object> Code(int code)
    {
        return code == 0 ? Ok() : Fail(code, "SDK code=" + code);
    }

    static MethodInfo Find(string name, object[] args)
    {
        var ms = robot.GetType().GetMethods().Where(m => m.Name == name).ToArray();
        if (ms.Length == 0) throw new MissingMethodException("fairino.Robot", name);
        var exact = ms.FirstOrDefault(m => m.GetParameters().Length == args.Length);
        return exact != null ? exact : ms[0];
    }

    static int Call(string name, params object[] args)
    {
        var m = Find(name, args);
        var ret = m.Invoke(robot, args);
        return ret == null ? 0 : Convert.ToInt32(ret);
    }

    static bool TryCall(string name, out int code, params object[] args)
    {
        code = -6;
        try { code = Call(name, args); return true; }
        catch (MissingMethodException) { return false; }
        catch (ArgumentException) { return false; }
    }

    /// <summary>ref 문자열 파라미터 개수를 SDK 시그니처에서 세서 기본값으로 채워 부른다 (추측 금지).</summary>
    static string[] CallRefStrings(string name, int preferArgCount)
    {
        var all = robot.GetType().GetMethods().Where(x => x.Name == name).ToArray();
        var m = all.FirstOrDefault(x => x.GetParameters().Length == preferArgCount) ?? all.FirstOrDefault();
        if (m == null) return new string[0];
        var ps = m.GetParameters();
        var args = ps.Select(p =>
        {
            var t = p.ParameterType.IsByRef ? p.ParameterType.GetElementType() : p.ParameterType;
            return t == typeof(int) ? (object)0 : (object)string.Empty;
        }).ToArray();
        var ret = m.Invoke(robot, args);
        if (ret != null && Convert.ToInt32(ret) != 0) return new string[0];
        return args.Select(a => a == null ? "" : a.ToString()).ToArray();
    }

    // ── 상태 — 필드는 이름 후보로 읽고, 못 읽은 것은 missing 목록에 남긴다.
    //    "없다"를 "괜찮다"로 바꾸는 건 브리지의 fail-closed 게이트다 (SAFETY-RULES 제1원칙).
    static readonly Dictionary<string, string[]> FieldCandidates = new Dictionary<string, string[]>
    {
        { "mode", new[] { "robot_mode", "robotMode", "cur_mode", "curMode", "mode" } },
        { "queueLen", new[] { "mc_queue_len", "mcQueueLen", "motion_queue_len", "motionQueueLength" } },
        { "emergencyStop", new[] { "EmergencyStop", "emergencyStop", "emergency_stop" } },
        { "collision", new[] { "collisionState", "collision_state", "isCollisionDetected" } },
        { "enabled", new[] { "rbtEnableState", "robotEnableState", "robot_enable_state", "enableState", "enable_state" } },
        { "dragTeach", new[] { "isInDragTeach", "is_in_drag_teach", "dragTeach", "drag_teach", "dragState", "drag_state" } },
        { "mainError", new[] { "main_code", "main_err_code", "mainErrorCode" } },
        { "subError", new[] { "sub_code", "sub_err_code", "subErrorCode" } },
        { "cmdPointError", new[] { "cmdPointError", "cmd_point_error" } },
        { "safetyStop0", new[] { "safety_stop0_state", "safetyStop0State" } },
        { "safetyStop1", new[] { "safety_stop1_state", "safetyStop1State" } },
        { "strangePose", new[] { "strangePosFlag", "strange_pos_flag" } },
        { "toolId", new[] { "tool", "toolNum", "tool_id", "toolId" } },
        { "userId", new[] { "user", "userNum", "user_id", "userId" } },
    };

    static Dictionary<string, object> ReadState()
    {
        Require();
        var pkgType = sdk.GetType("fairino.ROBOT_STATE_PKG");
        if (pkgType == null) throw new Exception("ROBOT_STATE_PKG 없음");
        var args = new[] { Activator.CreateInstance(pkgType) };
        var code = Call("GetRobotRealTimeState", args);
        if (code != 0) return Fail(code, "GetRobotRealTimeState code=" + code);
        var pkg = args[0];

        var result = Ok();
        var missing = new List<string>();
        var joints = ReadDoubles(pkg, "jt_cur_pos", 6);
        var tcp = ReadDoubles(pkg, "tl_cur_pos", 6);
        if (joints == null) missing.Add("jt_cur_pos");
        if (tcp == null) missing.Add("tl_cur_pos");
        result["jointsDeg"] = joints ?? new double[6];
        result["tcpMmDeg"] = tcp ?? new double[6];
        foreach (var kv in FieldCandidates)
        {
            object v = null;
            foreach (var n in kv.Value)
            {
                v = GetField(pkg, n);
                if (v != null) break;
            }
            if (v == null) { missing.Add(kv.Key); continue; }
            result[kv.Key] = Convert.ToInt64(v);
        }
        // 드리프트 검사(#9 대안) 재료 — cmdPointError 필드가 이 SDK 구조체에 없다 (2026-07-31 전수 확인)
        var servoTarget = ReadDoubles(pkg, "lastServoTarget", 6);
        if (servoTarget != null) result["lastServoTarget"] = servoTarget;
        // 드래그 티칭 — 필드가 없어 Unity 와 같은 IsInDragTeach 메서드 폴백 (원본 대조)
        if (!result.ContainsKey("dragTeach"))
        {
            var dm = robot.GetType().GetMethods().FirstOrDefault(x => x.Name == "IsInDragTeach" && x.GetParameters().Length == 1);
            if (dm != null)
            {
                var pt = dm.GetParameters()[0].ParameterType;
                var et = pt.IsByRef ? pt.GetElementType() : pt;
                var da = new object[] { Activator.CreateInstance(et) };   // ref byte 면 (byte)0
                var dc = dm.Invoke(robot, da);
                if (dc == null || Convert.ToInt32(dc) == 0)
                {
                    result["dragTeach"] = Convert.ToInt64(da[0]);
                    missing.Remove("dragTeach");
                }
            }
        }
        int safety;
        if (TryCall("GetSafetyCode", out safety)) result["safetyCode"] = safety;
        else missing.Add("safetyCode");
        result["missing"] = missing;
        return result;
    }

    static object GetField(object o, string name)
    {
        var f = o.GetType().GetField(name, BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance);
        return f == null ? null : f.GetValue(o);
    }

    static double[] ReadDoubles(object o, string name, int n)
    {
        var raw = GetField(o, name) as double[];
        if (raw == null) return null;
        var copy = new double[n];
        Array.Copy(raw, copy, Math.Min(raw.Length, n));
        return copy;
    }

    // ── MoveJ — Unity 검증 11인자 시그니처 그대로 (STACK.md)
    static Dictionary<string, object> MoveJ(Dictionary<string, object> req)
    {
        Require();
        var joints = ((IEnumerable)req["jointsDeg"]).Cast<object>().Select(Convert.ToDouble).ToArray();
        if (joints.Length != 6) throw new Exception("jointsDeg 는 6축이어야 한다");
        var speed = (float)Convert.ToDouble(req["speedPct"]);
        var tool = req.ContainsKey("toolId") ? ToInt(req["toolId"]) : 0;
        var user = req.ContainsKey("userId") ? ToInt(req["userId"]) : 0;

        var jointPos = NewSdk("fairino.JointPos");
        SetField(jointPos, "jPos", joints);
        var exaxis = NewSdk("fairino.ExaxisPos");
        SetField(exaxis, "ePos", new double[4]);

        var code = Call("MoveJ",
            jointPos, tool, user, speed, speed, 100f, exaxis, 0f, (byte)0, NewDescPose());
        return Code(code);
    }

    static object NewSdk(string typeName)
    {
        var type = sdk.GetType(typeName);
        if (type == null) throw new Exception(typeName + " 없음");
        return Activator.CreateInstance(type);
    }

    static void SetField(object o, string name, object value)
    {
        var f = o.GetType().GetField(name);
        if (f == null) throw new MissingFieldException(o.GetType().FullName, name);
        f.SetValue(o, value);
    }

    static object NewDescPose()
    {
        var pose = NewSdk("fairino.DescPose");
        var tran = NewSdk("fairino.DescTran");
        SetField(tran, "x", 0.0); SetField(tran, "y", 0.0); SetField(tran, "z", 0.0);
        var rpy = NewSdk("fairino.Rpy");
        SetField(rpy, "rx", 0.0); SetField(rpy, "ry", 0.0); SetField(rpy, "rz", 0.0);
        SetField(pose, "tran", tran);
        SetField(pose, "rpy", rpy);
        return pose;
    }
}

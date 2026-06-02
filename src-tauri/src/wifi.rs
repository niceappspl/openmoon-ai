use std::process::Command;

#[derive(Debug, Clone)]
pub struct WifiInfo {
    pub ssid: String,
    pub status: String,
    pub ip_address: String,
    pub internet: String,
    pub connection_type: String,
}

impl WifiInfo {
    pub fn format(&self) -> String {
        format!(
            "📶 Network Status:\n\n\
             Connection Type: {}\n\
             Network Name: {}\n\
             Status: {}\n\
             IP Address: {}\n\
             Internet: {}",
            self.connection_type, self.ssid, self.status, self.ip_address, self.internet
        )
    }
}

pub fn get_wifi_info() -> Result<WifiInfo, String> {
    let iface = wifi_interface();
    let ifconfig = run_command("ifconfig", &[&iface])?;
    let is_active = ifconfig.contains("status: active");
    let ip_address = parse_ip(&ifconfig).unwrap_or_else(|| "No IP address".to_string());

    let mut ssid = resolve_ssid(&iface);
    let mut status = if is_active || ip_address != "No IP address" {
        "Connected".to_string()
    } else {
        "Disconnected".to_string()
    };

    if ssid.is_none() && status == "Connected" {
        ssid = Some("Connected (hidden SSID)".to_string());
    }

    let ssid = ssid.unwrap_or_else(|| "Not connected".to_string());
    if status == "Disconnected" && ip_address != "No IP address" {
        status = "Connected".to_string();
    }

    Ok(WifiInfo {
        connection_type: "WiFi".to_string(),
        ssid,
        status,
        ip_address,
        internet: check_internet(),
    })
}

fn wifi_interface() -> String {
    let output = run_command("networksetup", &["-listallhardwareports"]).unwrap_or_default();
    let mut lines = output.lines().peekable();
    while let Some(line) = lines.next() {
        if line.contains("Wi-Fi") || line.contains("AirPort") {
            for next in lines.by_ref() {
                if let Some(device) = next.strip_prefix("Device: ") {
                    return device.trim().to_string();
                }
                if next.trim().is_empty() {
                    break;
                }
            }
        }
    }
    "en0".to_string()
}

fn resolve_ssid(iface: &str) -> Option<String> {
    if let Ok(summary) = run_command("ipconfig", &["getsummary", iface]) {
        if let Some(ssid) = parse_ipconfig_ssid(&summary) {
            return Some(ssid);
        }
    }

    if let Ok(profiler) = run_command("system_profiler", &["SPAirPortDataType"]) {
        if let Some(ssid) = parse_profiler_ssid(&profiler) {
            return Some(ssid);
        }
    }

    if let Ok(net) = run_command("networksetup", &["-getairportnetwork", iface]) {
        if let Some(ssid) = net
            .lines()
            .find_map(|line| line.strip_prefix("Current Wi-Fi Network: "))
        {
            let ssid = ssid.trim();
            if !ssid.is_empty() && !ssid.contains("not associated") {
                return Some(ssid.to_string());
            }
        }
    }

    None
}

fn parse_ipconfig_ssid(text: &str) -> Option<String> {
    for line in text.lines() {
        let trimmed = line.trim();
        for prefix in ["SSID :", "NetworkID :"] {
            if let Some(value) = trimmed.strip_prefix(prefix) {
                let ssid = value.trim();
                if !ssid.is_empty() {
                    return Some(ssid.to_string());
                }
            }
        }
    }
    None
}

fn parse_profiler_ssid(text: &str) -> Option<String> {
    let block = text.split("Current Network Information:").nth(1)?;
    for line in block.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.contains(':') && trimmed.split(':').count() > 2 {
            continue;
        }
        if let Some(name) = trimmed.strip_suffix(':') {
            let name = name.trim();
            if !name.is_empty()
                && !name.starts_with("PHY Mode")
                && !name.starts_with("Channel")
                && !name.starts_with("Country")
                && !name.starts_with("Network Type")
                && !name.starts_with("Security")
                && !name.starts_with("Signal")
                && !name.starts_with("Transmit")
                && !name.starts_with("MCS")
            {
                return Some(name.to_string());
            }
        }
    }
    None
}

fn parse_ip(text: &str) -> Option<String> {
    text.lines().find_map(|line| {
        line.trim()
            .strip_prefix("inet ")
            .and_then(|rest| rest.split_whitespace().next())
            .filter(|ip| !ip.starts_with("127."))
            .map(str::to_string)
    })
}

fn check_internet() -> String {
    if Command::new("ping")
        .args(["-c", "1", "-t", "2", "8.8.8.8"])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
    {
        return "✅ Internet access confirmed".to_string();
    }

    if Command::new("nslookup")
        .arg("google.com")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
    {
        return "✅ Internet access (DNS working)".to_string();
    }

    "❌ No internet connection".to_string()
}

fn run_command(program: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new(program)
        .args(args)
        .output()
        .map_err(|e| format!("Failed to run {}: {}", program, e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("{} failed: {}", program, stderr.trim()));
    }

    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_ipconfig_finds_ssid() {
        let sample = "  BSSID : aa:bb\n  SSID : MyNetwork\n  Security : WPA2";
        assert_eq!(parse_ipconfig_ssid(sample), Some("MyNetwork".to_string()));
    }

    #[test]
    fn parse_ipconfig_falls_back_to_network_id() {
        let sample = "  NetworkID : OfficeWiFi\n  Security : WPA2";
        assert_eq!(parse_ipconfig_ssid(sample), Some("OfficeWiFi".to_string()));
    }

    #[test]
    fn parse_profiler_finds_current_network() {
        let sample = "Current Network Information:\n            HomeNet:\n              PHY Mode: 802.11ax\n";
        assert_eq!(parse_profiler_ssid(sample), Some("HomeNet".to_string()));
    }

    #[test]
    #[ignore = "live system lookup"]
    fn live_wifi_lookup() {
        let info = get_wifi_info().expect("wifi lookup");
        assert_ne!(info.ssid, "Not connected");
        assert_eq!(info.status, "Connected");
    }
}

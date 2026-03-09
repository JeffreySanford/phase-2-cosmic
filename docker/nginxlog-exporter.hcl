listen {
  port = 4040
  address = "0.0.0.0"
  metrics_endpoint = "/metrics"
}

namespace "nginx_static" {
  source {
    files = ["/var/log/nginx/static-access*.log"]
  }

  format = "$remote_addr - $remote_user [$time_local] \"$request\" $status $body_bytes_sent $request_length $request_time \"$http_referer\" \"$http_user_agent\""

  labels {
    app = "nginx-static"
  }

  histogram_buckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5]
}

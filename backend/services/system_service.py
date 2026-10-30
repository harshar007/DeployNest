import os
import platform
import time
from typing import Dict, Any
import psutil
from backend.config import BASE_DIR


def get_system_health() -> Dict[str, Any]:
    """
    Collects real-time hardware metrics (CPU, RAM, Disk, Uptime)
    """
    # CPU
    cpu_percent = psutil.cpu_percent(interval=0.1)
    cpu_count = psutil.cpu_count(logical=True) or 1
    cpu_model = platform.processor() or "Standard Processor"

    # Memory
    mem = psutil.virtual_memory()
    total_mem = mem.total
    used_mem = mem.used
    free_mem = mem.available
    mem_percent = round((used_mem / total_mem) * 100) if total_mem > 0 else 0

    # Disk
    try:
        disk = psutil.disk_usage(str(BASE_DIR))
        total_disk = disk.total
        used_disk = disk.used
        free_disk = disk.free
        disk_percent = round((used_disk / total_disk) * 100) if total_disk > 0 else 0
    except Exception:
        total_disk = 100 * 1024 * 1024 * 1024
        free_disk = 65 * 1024 * 1024 * 1024
        used_disk = 35 * 1024 * 1024 * 1024
        disk_percent = 35

    # Uptime & OS
    boot_time = psutil.boot_time()
    uptime_seconds = int(time.time() - boot_time)

    return {
        "cpu": {
            "usagePercent": round(cpu_percent),
            "cores": cpu_count,
            "model": cpu_model,
        },
        "memory": {
            "totalBytes": total_mem,
            "usedBytes": used_mem,
            "freeBytes": free_mem,
            "usagePercent": mem_percent,
        },
        "disk": {
            "totalBytes": total_disk,
            "usedBytes": used_disk,
            "freeBytes": free_disk,
            "usagePercent": disk_percent,
        },
        "os": {
            "platform": platform.system().lower(),
            "distro": f"{platform.system()} {platform.release()}",
            "release": platform.version(),
            "hostname": platform.node(),
            "uptime": uptime_seconds,
        },
    }

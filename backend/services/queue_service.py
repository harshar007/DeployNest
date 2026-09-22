import asyncio
from typing import Optional
from backend.services.deployment_runner import DeploymentRunner


class DeploymentQueue:
    def __init__(self):
        self._queue: Optional[asyncio.Queue] = None
        self._worker_task: Optional[asyncio.Task] = None
        self._is_running = False

    def _ensure_queue(self):
        if self._queue is None:
            self._queue = asyncio.Queue()

    async def start_worker(self):
        """
        Starts the background queue consumer worker
        """
        self._ensure_queue()
        if self._worker_task and not self._worker_task.done():
            return

        self._is_running = True
        self._worker_task = asyncio.create_task(self._process_queue())
        print("[Queue] Background deployment worker started.")

    async def stop_worker(self):
        """
        Gracefully stops the worker
        """
        self._is_running = False
        if self._worker_task:
            self._worker_task.cancel()
            try:
                await self._worker_task
            except asyncio.CancelledError:
                pass
        print("[Queue] Background deployment worker stopped.")

    def add(self, deployment_id: str):
        """
        Enqueues a deployment ID for processing
        """
        self._ensure_queue()
        self._queue.put_nowait(deployment_id)
        print(f"[Queue] Enqueued deployment job: {deployment_id}")

    async def _process_queue(self):
        while self._is_running:
            try:
                deployment_id = await self._queue.get()
                print(f"[Queue] Processing deployment job: {deployment_id}")
                try:
                    await DeploymentRunner.run_deployment(deployment_id)
                except Exception as err:
                    print(f"[Queue] Error running job {deployment_id}: {err}")
                finally:
                    self._queue.task_done()
            except asyncio.CancelledError:
                break
            except Exception as loop_err:
                print(f"[Queue] Worker loop error: {loop_err}")
                await asyncio.sleep(1.0)

    def get_pending_count(self) -> int:
        return self._queue.qsize() if self._queue else 0


# Global singleton instance
deployment_queue = DeploymentQueue()

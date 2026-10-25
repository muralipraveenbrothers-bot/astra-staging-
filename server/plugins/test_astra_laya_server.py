import unittest
from unittest.mock import patch

import astra_laya_server as runtime


class FakeRouter:
    init_args = None
    loaded = None

    def __init__(self, **kwargs):
        FakeRouter.init_args = kwargs
        FakeRouter.loaded = []

    def load(self, checkpoint):
        FakeRouter.loaded.append(checkpoint)
        return object()


class LayaRouterConfigurationTests(unittest.TestCase):
    def setUp(self):
        self.previous = (runtime._router, runtime._router_initialized, runtime._router_init_error)
        runtime._router = None
        runtime._router_initialized = False
        runtime._router_init_error = None

    def tearDown(self):
        runtime._router, runtime._router_initialized, runtime._router_init_error = self.previous

    def test_only_configured_checkpoint_is_requested(self):
        with patch.object(runtime, "CHECKPOINTS", ["typed-decisions"]), \
             patch.object(runtime, "Router", FakeRouter), \
             patch.object(runtime, "_resident_memory_bytes", return_value=1234):
            router = runtime._ensure_router()

        self.assertIsInstance(router, FakeRouter)
        self.assertEqual(list(FakeRouter.init_args["models"]), ["typed-decisions"])
        self.assertFalse(FakeRouter.init_args["preload"])
        self.assertEqual(FakeRouter.init_args["max_loaded"], 1)
        self.assertEqual(FakeRouter.init_args["default"], "typed-decisions")
        self.assertEqual(FakeRouter.loaded, ["typed-decisions"])


class LayaMemoryGuardTests(unittest.TestCase):
    def test_memory_guard_requires_three_gib_and_skips_loading(self):
        self.assertFalse(runtime._has_minimum_load_memory(runtime.MINIMUM_LOAD_MEMORY_BYTES - 1))
        self.assertTrue(runtime._has_minimum_load_memory(runtime.MINIMUM_LOAD_MEMORY_BYTES))
        self.assertFalse(runtime._has_minimum_load_memory(None))
        original_state = runtime._model_state
        try:
            runtime._model_state = "loading"
            with patch.object(runtime, "LAYA_ENABLED", True), \
                 patch.object(runtime, "_available_memory_bytes", return_value=runtime.MINIMUM_LOAD_MEMORY_BYTES - 1), \
                 patch.object(runtime, "_ensure_router") as ensure_router:
                load_task = runtime._load_model_in_background()
                with self.assertRaises(StopIteration):
                    load_task.send(None)
            self.assertEqual(runtime._model_state, "insufficient_memory")
            ensure_router.assert_not_called()
        finally:
            runtime._model_state = original_state


if __name__ == "__main__":
    unittest.main()

# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import os
import random

from google.adk.agents.llm_agent import Agent
from google.adk.apps import App
from google.adk.plugins import BasePlugin
from google.adk.tools import DiscoveryEngineSearchTool
from google.adk.tools import SearchResultMode
from google.adk.tools.tool_context import ToolContext
from google.genai import types


class AvatarConfigPlugin(BasePlugin):
  """Plugin to inject Avatar configuration before the run starts."""

  def __init__(self):
    super().__init__(name='avatar_config_plugin')

  async def before_run_callback(self, *, invocation_context) -> None:
    avatar_name = 'Kai'  # Options include 'Kai', 'Cora'
    invocation_context.run_config.avatar_config = types.AvatarConfig(
        avatar_name=avatar_name,
    )
    # The avatar model expects 'VIDEO' modality only (which includes audio).
    # Specifying both ['AUDIO', 'VIDEO'] will cause a connection error.
    invocation_context.run_config.response_modalities = ['VIDEO']


def roll_die(sides: int, tool_context: ToolContext) -> int:
  """Roll a die and return the rolled result.

  Args:
    sides: The integer number of sides the die has.

  Returns:
    An integer of the result of rolling the die.
  """
  result = random.randint(1, sides)
  if not 'rolls' in tool_context.state:
    tool_context.state['rolls'] = []

  tool_context.state['rolls'] = tool_context.state['rolls'] + [result]
  return result


async def check_prime(nums: list[int]) -> str:
  """Check if a given list of numbers are prime.

  Args:
    nums: The list of numbers to check.

  Returns:
    A str indicating which number is prime.
  """
  primes = set()
  for number in nums:
    number = int(number)
    if number <= 1:
      continue
    is_prime = True
    for i in range(2, int(number**0.5) + 1):
      if number % i == 0:
        is_prime = False
        break
    if is_prime:
      primes.add(number)
  return (
      'No prime numbers found.'
      if not primes
      else f"{', '.join(str(num) for num in primes)} are prime numbers."
  )


# Use the App/Engine ID instead of Datastore ID to enable Enterprise Website Search features.
# Replace with your own Vertex AI Search Engine ID or set the VERTEXAI_ENGINE_ID environment variable.
VERTEXAI_ENGINE_ID = os.getenv("VERTEXAI_ENGINE_ID") or "fish_1780620606280"

# If a raw engine ID is provided, automatically expand it to a full GCP resource name path
if VERTEXAI_ENGINE_ID and not VERTEXAI_ENGINE_ID.startswith("projects/"):
  project_id = os.getenv("GCP_PROJECT") or os.getenv("GOOGLE_CLOUD_PROJECT") or "adk-fish"
  VERTEXAI_ENGINE_ID = f"projects/{project_id}/locations/global/collections/default_collection/engines/{VERTEXAI_ENGINE_ID}"


root_agent = Agent(
    # Find supported models in Vertex here: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/live-api
    model='gemini-3.1-flash-live-preview-04-2026',  # Vertex
    # Find supported models in Gemini API here: https://ai.google.dev/gemini-api/docs/models
    # model='gemini-2.5-flash-native-audio-preview-12-2025',  # Gemini API
    name='roll_dice_agent',
    description=(
        'hello world agent that can roll a dice of 6 sides, check prime'
        ' numbers, and search information.'
    ),
    instruction="""
      You roll dice and answer questions about the outcome of the dice rolls.
      You can roll dice of different sizes. When the user doesn't specify the number of sides, you should assume 6 sides.
      You can use multiple tools in parallel by calling functions in parallel(in one request and in one round).
      It is ok to discuss previous dice roles, and comment on the dice rolls.
      When you are asked to roll a die, you must call the roll_die tool with the number of sides. Be sure to pass in an integer. Do not pass in a string.
      You should never roll a die on your own.
      When checking prime numbers, call the check_prime tool with a list of integers. Be sure to pass in a list of integers. You should never pass in a string.
      You should not check prime numbers before calling the tool.
      When you are asked to roll a die and check prime numbers, you should always make the following two function calls:
      1. You should first call the roll_die tool to get a roll. Wait for the function response before calling the check_prime tool.
      2. After you get the function response from roll_die tool, you should call the check_prime tool with the roll_die result.
        2.1 If user asks you to check primes based on previous rolls, make sure you include the previous rolls in the list.
      3. When you respond, you must include the roll_die result from step 1.
      You should always perform the previous 3 steps when asking for a roll and checking prime numbers.
      You should not rely on the previous history on prime results.
      When you need to search for internal documentation or information, call the `discovery_engine_search` tool.
    """,
    tools=[
        roll_die,
        check_prime,
        DiscoveryEngineSearchTool(
            search_engine_id=VERTEXAI_ENGINE_ID,
            search_result_mode=SearchResultMode.DOCUMENTS,
        ),
    ],
    generate_content_config=types.GenerateContentConfig(
        safety_settings=[
            types.SafetySetting(  # avoid false alarm about rolling dice.
                category=types.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                threshold=types.HarmBlockThreshold.OFF,
            ),
        ]
    ),
)


app = App(
    name='live_avatar_agent',
    root_agent=root_agent,
    plugins=[
        AvatarConfigPlugin(),
    ],
)

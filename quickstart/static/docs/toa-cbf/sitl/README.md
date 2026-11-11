# SITL: the TOA+CBF charpi policy in PX4 SITL + Gazebo

This folder flies `runs/toa_cbf_charpi/policy.onnx` in PX4 SITL with gz sim 8 (Harmonic), through
the same path as on the real drone: the C++ node `toa_nav_node` (rl_infer_cpp) sends body rates to
PX4 while the offboard FSM is in body-rate mode. Each forest or large-obstacle trial of
`evaluate.py` becomes a gz world with the same obstacles, and each flight is scored with the
same rules as `evaluate.py`. So a SITL trial can be compared one to one with the Python trial
that has the same seed.

| File | What it does | Runs with |
|---|---|---|
| `make_gz_world.py` | writes `<world>.sdf` and `<world>.json` for one trial (obstacles in training coordinates) | DN `.venv` |
| `sitl_driver.py` | takes off, waits at the start, engages the policy, scores live, holds, logs `traj.csv` + `meta.json` | system `python3 -s` with ROS sourced |
| `score_sitl.py` | re-scores run folders, writes an `evaluate.py`-style JSON and a paired SITL-vs-Python table | DN `.venv` |
| `run_trials.sh` | the whole batch: worlds, sims in tmux, launch, driver, teardown, score | bash |
| `make_reference.py` | golden vectors of the Python closed loop for the C++ port (`toa_validate`) | DN `.venv` |
| `plot_compare.py` | top-down paths and success-rate/speed bars, SITL vs Python, for one batch | DN `.venv` |
| `real_world.py` | realistic 50 m forest (Gazebo Fuel oaks, firs, rocks, bench, barrels, cones on grass) + mesh-based scoring | DN `.venv` (build), any python (score) |
| `make_video.py` | mp4 of one run: Gazebo chase view replayed from the flown poses, depth input, top view, flight data | system `python3 -s` with ROS sourced |

Frames: gz world ENU, z up. Training puts the ground at z = -1 and gz puts it at z = 0, so
gz z = training z + 1. The eval start (0, 0, 0) is gz (0, 0, 1) and the goal (35, 0, 0) is gz
(35, 0, 1). The drone starts at the start, 1 m above the ground, nose toward the goal.

## Offline check of the C++ node (no sim)

`make_reference.py` records one real `evaluate.py` trial (TF32 off, so the network is plain fp32);
`toa_validate` replays it through the node's code and the ONNX policy. Both must print OK.

```bash
cd ~/diff_nav_toa_cbf && source .venv/bin/activate && unset PYTHONPATH PYTHONHOME LD_LIBRARY_PATH LD_PRELOAD
python sitl/make_reference.py                     # forest s3 trial 0, 5 m/s, clean depth
python sitl/make_reference.py --depth_noise stereo --trial 3 --speed 9 \
    --out runs/toa_cbf_charpi/sitl_reference_stereo_t3_v9.bin
B=~/realflight_ws/install/rl_infer_cpp/lib/rl_infer_cpp/toa_validate
$B replay runs/toa_cbf_charpi/policy.onnx runs/toa_cbf_charpi/sitl_reference.bin   # max act error ~1e-5
$B ctbr runs/toa_cbf_charpi/sitl_reference.bin
```

## Before the first run

1. Stop any other gz server. `px4-rc.gzsim` joins any running world instead of starting the new
   one. Check with `pgrep -af "gz sim"`. Both `sitl_charpi_nav.sh` and `run_trials.sh` refuse to
   start while one runs.
2. Build the ROS side once:
   ```bash
   source /opt/ros/humble/setup.bash && cd ~/realflight_ws && source install/setup.bash
   colcon build --packages-select rl_infer_cpp offboard_state_machine --cmake-args -DCMAKE_BUILD_TYPE=Release
   ```
3. The DN `.venv` must be set up (`bash scripts/setup/setup_workstation.sh`).

## One trial by hand (4 terminals)

```bash
# 0) world for forest spacing 3, seed 0, trial 0 (writes sitl_runs/worlds/toa_forest_s3_seed0_t0.{sdf,json})
cd ~/diff_nav_toa_cbf && source .venv/bin/activate && unset PYTHONPATH PYTHONHOME LD_LIBRARY_PATH LD_PRELOAD
python sitl/make_gz_world.py --scenario forest --spacing 3 --seed 0 --trial 0 --out sitl_runs/worlds

# 1) DDS agent
MicroXRCEAgent udp4 -p 8888

# 2) PX4 + gz with the depth camera (add "headless" for no GUI; SKIP_BUILD=1 skips make px4_sitl)
cd ~/realflight_ws/src/charpi_vision_description
./sitl_charpi_nav.sh ~/diff_nav_toa_cbf/sitl_runs/worlds/toa_forest_s3_seed0_t0.sdf

# 3) FSM + commander + toa_nav_node + gz bridge (depth, odometry, /clock)
cd ~/realflight_ws && source install/setup.bash
ros2 launch offboard_state_machine interactive_test.launch.py task:=toa_nav \
    toa_world:=toa_forest_s3_seed0_t0 toa_start:=0,0,1 toa_goal:=35,0,1 toa_max_speed:=5 rviz:=false
```

Then type in terminal 3:

- `ttt`: arm, take off and fly to the start (0, 0, 1), nose toward the goal. Wait until the FSM
  reports HOVER and the drone is still.
- `nnn`: engage the policy. The commander refuses unless the drone has stayed within 0.35 m of the
  start and below 0.25 m/s for 3 s (`toa_settle_s`), and the node reports ready (pose, attitude
  and depth fresh).
- Within 5 m of the goal the node publishes `/rl/goal_reached` and the commander holds (`iii`).
  `q` holds at once, `lll` lands.

To log and score a hand-started trial, run the driver instead of typing `ttt`/`nnn` (it does the
same steps without the commander):

```bash
# terminal 4, with the sim and the launch up
source /opt/ros/humble/setup.bash && source ~/realflight_ws/install/setup.bash
cd ~/diff_nav_toa_cbf
python3 -s sitl/sitl_driver.py --scene sitl_runs/worlds/toa_forest_s3_seed0_t0.json --speed 5 --out sitl_runs/manual/t0_v5
# DN .venv:
python sitl/score_sitl.py sitl_runs/manual --out_dir sitl_runs/manual
```

`--speed` must equal `toa_max_speed`: the driver uses it only for the time-out. Use
`python3 -s` so the apt numpy 1.x is used (the numpy 2.x in `~/.local` breaks parts of ROS python).

## The batch harness

```bash
cd ~/diff_nav_toa_cbf
sitl/run_trials.sh --scenario forest --spacing 3 --trials 5 --speeds 3 5 7 9
sitl/run_trials.sh --dry_run --trials 2 --speeds 5       # print the commands, start nothing
```

For every (trial, speed) it makes the world, opens a tmux session `toa_sitl_<time>_t<i>_v<v>`
(windows `agent`, `sitl`, `launch`), waits for the world clock, "time sync converged" and
"toa_nav_node started:", runs the driver, then stops that session. It stops only processes started
in that session (they carry `TOA_SITL_RUN=<session>` in their environment), never anything else.
`make px4_sitl` runs before the first flight only (`--skip_build` skips it always).

Useful options: `--gui` (gz GUI), `--keep` (leave the last sim running; `run_trials.sh --teardown
<session>` stops it later), `--depth_noise none`, `--obs_delay 0 --action_delay 0` (remove the
trained latency, for tests), `--gt_source odom` (node uses gz ground truth instead of the PX4 EKF),
`--bag` (record a ros2 bag per run), `--depth_rate HZ` (camera rate, default 100), `--out DIR`.

Obstacles in batch worlds are **visual only** by default: the depth camera sees them, the drone
cannot touch them, and a run ends at its first geometric contact, as in `evaluate.py`. With
collision shapes (`--collision`), contacts near the large obstacles slowed gz to a real-time
factor of 0.3-0.6, which changes the node's timing (see below). The forest trees are small and
were fine either way. `make_gz_world.py` keeps collision shapes by default (add `--no_collision`),
so a hand-flown drone visibly crashes.

Output (default `sitl_runs/<tag>_seed<seed>_<date_time>/`):

```
worlds/forest_s3_seed0/t0/toa_forest_s3_seed0_t0.{sdf,json}
runs/toa_forest_s3_seed0_t0_v5/{traj.csv, meta.json, scene.json, agent.log, sitl.log, launch.log, driver.log}
runs.tsv                                         one line per run: trial, speed, exit code, end reason
toa_cbf_charpi_sitl_forest_s3.json               evaluate.py schema
toa_cbf_charpi_sitl_forest_s3_paired.md          SITL vs Python, trial by trial
```

Compare with the Python tables and plots as usual:

```bash
python compare.py results/toa_cbf_charpi_forest_s3.json sitl_runs/<dir>/toa_cbf_charpi_sitl_forest_s3.json --ours toa_cbf_charpi
python sitl/score_sitl.py sitl_runs/<dir>/runs --out_dir sitl_runs/<dir> --plot      # adds a Fig. 4-style png
python sitl/plot_compare.py sitl_runs/<dir>     # compare_paths.png + compare_summary.png, SITL vs Python
```

## Realistic forest (`--scenario real`)

```bash
sitl/run_trials.sh --scenario real --trials 3 --speeds 7 --bag      # worlds toa_real_seed<seed>_t<i>, goal 50 m
```

`real_world.py build` places Fuel models from the local cache (download once: `gz fuel download -u
'https://fuel.gazebosim.org/1.0/OpenRobotics/models/Oak tree'`, and the same for `Pine Tree`, `Falling Rock 1`,
`Falling Rock 2`, `Grass Plane`, `FoodCourtBenchLong`, `Construction Barrel`, `Construction Cone`). Oaks are
stretched to about 1 m trunks with leaves from about 3 m and sunk so their roots stay low. Young firs are sunk so
their branches reach the ground; otherwise the drone ducks under them past the bare trunk. A work zone of barrels
and cones sits on the straight route, somewhere between 20 and 34 m. Everything is visual only.

`--course open` (default) is the course above. `--course slalom` makes the route harder: four rows of young firs
cross it at about 10, 20, 31 and 41 m, each with one clear gap of about 3 m placed 2.5-4.5 m off the centre line
on alternate sides, so the drone must swing 7-9 m sideways every 10 m. The work zone sits where the line between
the 2nd and 3rd gaps would pass (worlds `toa_real_slalom_seed<seed>_t<i>`). The policy mostly climbs over the rows
instead of turning to the gaps: 2 of 6 flights were clean (trials 0-2 at 5 and 7 m/s).

Training never sees Gazebo: it runs in DiffPhysDrone's Python simulator with random spheres, small boxes, poles,
two horizontal bars, ground bumps and, in half the episodes, a ceiling. These Gazebo objects are outside that
distribution (overhead leaves, root flares, cones, irregular trunks), which is the point. The scene json holds
inner proxies (trunk cylinders, balls) so `sitl_driver.py` runs unchanged, but the score comes from `real_world.py
score`: clearance to points sampled on every mesh surface below 9 m (`<world>_cloud.npz`, see-through leaf texels
dropped), minus the 0.15 m drone radius. There is no Python twin to pair with.

## Video of one run

Fly with `--bag` (the video takes the depth images and the node's debug data from the bag), then:

```bash
source /opt/ros/humble/setup.bash && source ~/realflight_ws/install/setup.bash
cd ~/diff_nav_toa_cbf
python3 -s sitl/make_video.py sitl_runs/<dir>/runs/<run>        # writes <run>/video.mp4, 1920x1080, 30 fps
```

The chase view is rendered after the flight: a headless gz server loads the same world (recoloured, with
5 m ground lines and the 5 m goal disc), and each frame teleports the drone to its `traj.csv` pose and
steps once. So the motion is the flown one, but the props spin at a fixed rate for looks. The depth panels
show the clean gz image; the node adds its stereo noise internally. A 9 s clip renders in about 10 s.

## How a run is scored

Same rules as `evaluate.py`, on the gz ground-truth odometry (200 Hz), in training coordinates:

- The episode starts when the FSM reports TRAJ after the engage (`--t0 cmd`: at the engage publish).
- Collision: the scene distance (trees, spheres, boxes, ground at z = -1) minus 0.15 m drops below
  0 at any sample, or at points filled in so that checks are at most 5 cm apart. Evaluate.py checks
  10 points per 1/15 s; at 9 m/s that is 6.7 cm apart.
- Success: within 5 m of the goal (3-D), checked after the collision test of the same sample.
- Time-out: no event within ceil((3 * 35 / v + 5) * 15) / 15 s, e.g. 26.0 s at 5 m/s.
- Mean speed = path length / time to the event; min clearance and max speed stop at the event.

The driver scores live (pure python) to know when to hold. `score_sitl.py` re-scores with
`toanav.geometry.scene_sdf` and is the number to report. A run that ended for another reason
(engage failed, interrupted, odometry lost, the FSM left TRAJ, the node's
fail-safe tripped on a stale pose or depth feed: `node_failsafe`) is listed under "Not counted".
The paired table pairs SITL trial i at speed v with Python trial i at speed v of
`results/toa_cbf_charpi_<tag>.json` (same scenario, spacing and seed; `--ref` picks another file,
for example an `evaluate.py --charpi_br_fit sitl` result). It gives SR and mean speed on the paired
trials, an exact McNemar test on the discordant pairs, and the unpaired Fisher test of `compare.py`.

`traj.csv` columns: `t_sim` (s, gz stamp), `t_wall` (s, monotonic), `phase` (pre / armed /
engaged / post), position `x y z` (gz ENU, m), world velocity `vx vy vz` (body twist rotated by the
pose, m/s), `qx qy qz qw`, the raw body twist `vbx vby vbz wbx wby wbz`, FSM state, and the live
clearance (m). `meta.json` holds the engage and end times, the end reason, the live result, the
real-time factor while engaged, the depth image rate, the FSM transitions and the launch settings.

## Things to watch

- Real-time factor (`rtf` in `meta.json`, RTF column in the table). The node's timers run on wall
  time, so below 1 the policy runs faster in sim time than in training. `score_sitl.py` flags runs
  whose 1 s minimum drops below 0.95. Fly batches on a quiet machine: heavy GPU/CPU jobs stall gz,
  the pose or depth feed goes stale, and the node's fail-safe ends the run (`node_failsafe`, not
  counted).
- The PX4 body-rate loop in this airframe is slower than the "real" fit the policy trained on.
  `evaluate.py --charpi_br_fit sitl` gives the Python prediction for it; pair against it with `--ref`.
- The policy and the scorer use a 0.15 m radius; the physical charpi is about 0.2 m. gz can show
  a contact while the score still shows clearance > 0, or the reverse.

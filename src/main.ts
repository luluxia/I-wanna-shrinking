import kaboom from 'kaboom'

// 初始化
const k = kaboom({
  width: 1280,
  height: 720,
  // stretch: true,
})
const state = {
  showTransition: false,
  transitionTime: 0,
}
let staticDataList: string[][] = []
let mapDataList: any[] = []
// k.debug.inspect = true
k.setGravity(1500)

// 加载素材
k.loadBean()
k.loadSprite('gun', 'img/gun.png')
k.loadSprite('backGround', 'img/bg.png')
k.loadSprite('portal', 'img/portal.png')
k.loadShader('transition', undefined, `
uniform vec2 u_resolution;
uniform float u_time;

vec4 frag(vec2 pos, vec2 uv, vec4 color, sampler2D tex) {
  vec4 origColor = def_frag();

  // 计算像素的位置
  vec2 pixelPos = uv * u_resolution;

  // 计算矩形的大小
  float squareSize = min(u_resolution.x, u_resolution.y) * 0.2; // 矩形的大小为屏幕最小边的20%

  // 计算像素所在的矩形的行数和列数
  int column = int(pixelPos.x / squareSize);
  int row = int(pixelPos.y / squareSize);

  // 计算像素所在的矩形的中心
  vec2 squareCenter = vec2(float(column) * squareSize + squareSize * 0.5, float(row) * squareSize + squareSize * 0.5);

  // 计算菱形的大小（根据时间和列数动态变化，但不超过矩形的大小）
  float diamondSize;
  if (u_time < 0.8) {
    diamondSize = min(squareSize, squareSize * (u_time - float(column) * 0.05) * 2.5);
  } else {
    diamondSize = min(squareSize, squareSize * (1.4 - (u_time - float(column) * 0.05)) * 2.5);
  }

  // 计算像素位置与菱形中心的距离
  float distance = abs(pixelPos.x - squareCenter.x) + abs(pixelPos.y - squareCenter.y);

  // 检查像素是否在菱形内
  if (distance <= diamondSize) {
    // 如果在菱形内，设置颜色为黑色
    return vec4(0.0, 0.0, 0.0, 1.0);
  }

  // 如果不在菱形内，使用原始颜色
  return origColor;
}
`);
k.load(new Promise<void>(async resolve => {
  const fetchPromises = Array.from({ length: 13 }).map(async (_, i) => {
    k.loadSprite(`map${i}`, `map/simplified/Level_${i}/AutoLayer.png`)
    await fetch(`map/simplified/Level_${i}/Static.csv`, {
      headers: {
        'Content-Type': 'text/csv',
      }
    }).then(res => res.text()).then(data => {
      const staticData = data.split('\n').map((row: string) => row.replace(/,/g, ''))
      staticDataList.push(staticData)
    })
    await fetch(`map/simplified/Level_${i}/data.json`)
    .then(res => res.json())
    .then(data => {
      mapDataList.push(data)
    })
  })

  await Promise.all(fetchPromises)
  resolve()
}))

k.onLoad(() => {
  k.go('game', 0)
})

k.scene('game', (mapId: number) => {
  // 初始化背景
  const backGround = k.add([
    k.sprite('backGround', {
      width: 320,
      height: 196,
      tiled: true,
    }),
    k.pos(0, -16),
    k.scale(4),
    k.fixed(),
    {
      update() {
        backGround.move(0, 64)
        if (backGround.pos.y >= 0) {
          backGround.pos.y = -128
        }
      }
    }
  ])
  // 初始化玩家
  const player = k.add([
    k.sprite('bean'),
    k.pos(0, 0),
    k.anchor('center'),
    k.area(),
    k.body(),
    k.z(1),
  ])
  const gun = player.add([
    k.sprite('gun'),
    k.anchor(k.vec2(-1.5, 0)),
    k.rotate(0),
    {
      update() {
        gun.angle = k.mousePos().angle(k.toScreen(player.pos)) + 6
      },
    }
  ])
  // 初始化操作
  k.onClick(() => {
    const dir = k.mousePos().sub(k.toScreen(player.pos)).unit()
    k.add([
      k.rect(10, 40, {
        radius: 5,
      }),
      k.color(255, 70, 100),
      k.outline(5),
      k.pos(player.pos.add(dir.scale(80))),
      k.anchor(k.vec2(0, 0)),
      k.rotate(gun.angle + 84),
      k.move(dir, 1000),
      k.area(),
      k.offscreen({ destroy: true }),
      'bullet',
    ])
  })
  k.onKeyDown('a', () => {
    player.move(-400, 0)
  })
  k.onKeyDown('d', () => {
    player.move(400, 0)
  })
  k.onKeyPress('w', () => {
    if (player.isGrounded()) {
      player.jump(700)
    }
  })
  k.onKeyPress('space', () => {
    if (player.isGrounded()) {
      player.jump(700)
    }
  })
  k.onKeyPress('r', () => {
    if (state.showTransition) {
      return
    }
    state.showTransition = true
    state.transitionTime = 0
    setTimeout(() => {
      k.go('game', mapId)
    }, 1000)
    setTimeout(() => {
      state.showTransition = false
    }, 2000)
  })
  // 初始化地图
  const map = k.add([
    k.sprite(`map${mapId}`),
    k.scale(4),
  ])
  // 解析固态层
  k.addLevel(staticDataList[mapId], {
    tileWidth: 64,
    tileHeight: 64,
    tiles: {
      '1': () => [
        k.rect(64, 64, { fill: false }),
        k.area(),
        k.body({ isStatic: true }),
        'ground',
      ]
    }
  })
  // 解析地图数据
  const data = mapDataList[mapId]
  Object.keys(data.entities).forEach(key => {
    // 出生点
    if (key === 'Player') {
      const playerData = data.entities[key][0]
      player.pos = k.vec2(playerData.x + 8, playerData.y + 8).scale(4)
      k.camPos(player.pos)
    }
    // 方块
    if (key === 'Block') {
      data.entities[key].forEach((blockData: any) => {
        const type = blockData.customFields.Type
        const block = k.add([
          k.rect(blockData.width * 4, blockData.height * 4),
          k.outline(4, k.rgb(84, 84, 84)),
          k.area(),
          k.body(),
          k.pos(k.vec2(blockData.x + blockData.width / 2, blockData.y + blockData.height / 2).scale(4)),
          k.anchor('center'),
          'block',
        ])
        if (type === 'Gravity') {
          block.use(k.color(166, 85, 95))
        } else if (type === 'AntiGravity') {
          block.use(k.color(74, 188, 255))
          block.use(k.body({ gravityScale: 0, mass: 100 }))
          
          block.onUpdate(() => {
            block.vel.y = -100
            // block.move(0, -200)
          })
        }
      })
      // player.onCollide('block', (block) => {
      //   block.use(k.body({ isStatic: true }))
      // })
      // player.onCollideEnd('block', (block) => {
      //   block.use(k.body())
      // })
    }
    // 传送门
    if (key === 'Portal') {
      data.entities[key].forEach((protalData: any) => {
        k.add([
          k.sprite('portal'),
          k.pos(k.vec2(protalData.x + 8, protalData.y + 8).scale(4)),
          k.anchor('center'),
          k.area(),
          k.body({ isStatic: true }),
          'portal',
        ])
      })
      player.onCollide('portal', () => {
        if (state.showTransition) {
          return
        }
        state.showTransition = true
        state.transitionTime = 0
        setTimeout(() => {
          k.go('game', mapId + 1)
        }, 1000)
        setTimeout(() => {
          state.showTransition = false
        }, 2000)
      })
    }
  })
  k.onCollide('bullet', 'block', (bullet, block) => {
    k.addKaboom(bullet.pos, {
      scale: 0.5,
    })
    k.destroy(bullet)
    // block.use(k.rect(block.width / 2, block.height / 2))
    k.tween(block.width, block.width - 64, 0.3, v => block.width = v, k.easings.easeOutBack)
    k.tween(block.height, block.height - 64, 0.3, v => block.height = v, k.easings.easeOutBack)
    setTimeout(() => {
      if (block.width <= 0 || block.height <= 0) {
        k.destroy(block)
      }
    }, 300);
  })
  k.onCollide('bullet', 'ground', (bullet) => {
    k.destroy(bullet)
  })
  // 摄像头跟随
  // player.onPhysicsResolve(() => {
	// 	k.camPos(player.pos)
	// })
  k.onUpdate(() => {
    const targetPos = k.vec2(Number(player.pos.x.toFixed(2)), Number(player.pos.y.toFixed(2)))
    const currentPos = k.camPos()
    const newPos = k.vec2(k.lerp(currentPos.x, targetPos.x, 0.05), targetPos.y)
    k.camPos(newPos)
    if (state.showTransition) {
      state.transitionTime += k.dt()
      k.usePostEffect('transition', {
        'u_time': state.transitionTime,
        'u_resolution': k.vec2(k.width(), k.height()),
      })
    }
    // 跌落
    if (player.pos.y > map.height * 4 && !state.showTransition) {
      state.showTransition = true
      state.transitionTime = 0
      setTimeout(() => {
        k.go('game', mapId)
      }, 1000)
      setTimeout(() => {
        state.showTransition = false
      }, 2000)
    }
  })
})
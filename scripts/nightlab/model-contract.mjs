// Reused Nightlab model contract, adapted only to this repository's local modules.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from '../../src/shared/nightlab/vendor/three/three.module.js';
import {STLLoader} from '../../src/shared/nightlab/vendor/three/STLLoader.js';
import {createBlink1Model} from '../../dist/web/shared/nightlab/light-model.js';
function modelContract(){
  const loader=new STLLoader();
  const load=name=>{
    const bytes=readFileSync(new URL('../../dist/web/shared/nightlab/model-assets/'+name,import.meta.url));
    return loader.parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  };
  const diffuserGeometry=load('blink1mk2_enclosure_diffuser_v3k.stl'),frameGeometry=load('blink1mk2_enclosure_frame_v3k.stl');
  const inputs=[diffuserGeometry,frameGeometry];let inputDisposals=0;
  const geometryHash=geometry=>{
    const digest=createHash('sha256');
    for(const [name,attribute] of Object.entries({...geometry.attributes,index:geometry.index}).sort(([a],[b])=>a.localeCompare(b))){
      if(!attribute)continue;digest.update(name);digest.update(Buffer.from(attribute.array.buffer,attribute.array.byteOffset,attribute.array.byteLength));
    }
    return digest.digest('hex');
  };
  const originals=inputs.map(geometryHash);for(const input of inputs)input.addEventListener('dispose',()=>inputDisposals++);
  const model=createBlink1Model(THREE,{diffuserGeometry,frameGeometry}),scene=new THREE.Scene();scene.add(model.group);
  const geometries=new Set(),materials=new Set(),textures=new Set();
  model.group.traverse(node=>{
    if(node.geometry)geometries.add(node.geometry);
    for(const material of node.material?(Array.isArray(node.material)?node.material:[node.material]):[]){
      materials.add(material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value);
    }
  });
  const resources=[...geometries,...materials,...textures],disposals=new Map(resources.map(resource=>[resource,0]));
  for(const resource of resources)resource.addEventListener('dispose',()=>disposals.set(resource,disposals.get(resource)+1));
  try{
    assert.deepEqual(inputs.map(geometryHash),originals,'Model construction must preserve caller-owned CAD arrays');
    const frameSurface=model.group.getObjectByName('Original frame — CAD details retained')?.material;
    assert.ok(frameSurface,'The assembled metal frame has a real material');
    assert.ok(!frameSurface.polygonOffset || (frameSurface.polygonOffsetFactor>=0&&frameSurface.polygonOffsetUnits>=0),
      'Hidden metal must not be depth-biased ahead of the plastic mating surface');
    const lights=model.group.children.filter(node=>node.isPointLight).sort((a,b)=>b.position.y-a.position.y);
    assert.equal(lights.length,2,'The model has two independently addressable physical light faces');
    const [upper,lower]=lights;assert.ok(upper.position.y>lower.position.y);
    model.group.updateMatrixWorld(true);
    const inverseModel=model.group.matrixWorld.clone().invert();
    function localBounds(mesh){
      assert.ok(mesh?.geometry,'The USB part has actual geometry');
      const result=new THREE.Box3(),position=mesh.geometry.getAttribute('position');
      const transform=new THREE.Matrix4().multiplyMatrices(inverseModel,mesh.matrixWorld),point=new THREE.Vector3();
      for(let index=0;index<position.count;index++)result.expandByPoint(point.fromBufferAttribute(position,index).applyMatrix4(transform));
      return result;
    }
    const tongue=model.group.getObjectByName('Black recessed tongue'),roof=model.group.getObjectByName('Perforated steel roof'),floor=model.group.getObjectByName('Steel floor');
    const tongueBox=localBounds(tongue),roofBox=localBounds(roof),floorBox=localBounds(floor);
    const contactParts=[];model.group.traverse(node=>{if(/^Recessed contact \d+$/.test(node.name))contactParts.push(node);});
    assert.equal(contactParts.length,4,'The USB plug retains four recessed contact strips');
    const faceMidpoint=(upper.position.y+lower.position.y)/2;
    assert.ok(tongueBox.getCenter(new THREE.Vector3()).y<faceMidpoint,'The plastic tongue belongs to the lower ThingM side');
    let highestContact=-Infinity;
    for(const contact of contactParts){
      const box=localBounds(contact);highestContact=Math.max(highestContact,box.max.y);
      assert.ok(box.min.y>=tongueBox.max.y-1e-5,'The exposed contacts sit above the plastic toward the blink(1)-side cavity');
      assert.ok(box.max.y<roofBox.min.y&&box.min.x>roofBox.min.x,'The contacts remain recessed inside the metal shell');
      const transform=new THREE.Matrix4().multiplyMatrices(inverseModel,contact.matrixWorld),normalMatrix=new THREE.Matrix3().getNormalMatrix(transform);
      const positions=contact.geometry.getAttribute('position'),normals=contact.geometry.getAttribute('normal');
      const point=new THREE.Vector3(),normal=new THREE.Vector3();let upward=0,samples=0;
      for(let index=0;index<positions.count;index++){
        point.fromBufferAttribute(positions,index).applyMatrix4(transform);
        if(point.y<box.max.y-1e-5)continue;
        upward+=normal.fromBufferAttribute(normals,index).applyNormalMatrix(normalMatrix).y;samples++;
      }
      assert.ok(samples>0&&upward/samples>.5,'Actual exposed contact normals face the upper cavity');
    }
    assert.ok(roofBox.min.y-highestContact>tongueBox.min.y-floorBox.max.y,'The blink(1) face keeps the larger open half of the USB cavity');
    const diffusers=[];model.group.traverse(node=>{if(node.name==='One continuous milky diffuser')diffusers.push(node);});
    assert.equal(diffusers.length,1,'Both sources illuminate the same continuous diffuser mesh');
    const diffuser=diffusers[0],field=diffuser.material.userData.lightField;
    assert.ok(diffuser.isMesh&&field&&typeof field.fragment==='string','The rendered diffuser exposes its production GLSL field');
    for(const key of ['nb1SourceOne','nb1SourceTwo'])assert.ok(field.uniforms[key]?.value.isColor,'The field keeps independent linear-light source colors');
    for(const key of ['nb1ShellMin','nb1ShellSize'])assert.ok(field.uniforms[key]?.value.isVector3,'The field samples continuous model coordinates');
    assert.ok(field.uniforms.nb1ShellSize.value.toArray().every(value=>value>0));
    // Probe the actual material hook, rather than assuming a separately exposed
    // field is also the one used to render the physical diffuser.
    const shader={uniforms:{},vertexShader:THREE.ShaderLib.physical.vertexShader,fragmentShader:THREE.ShaderLib.physical.fragmentShader};
    diffuser.material.onBeforeCompile(shader);
    assert.ok(shader.fragmentShader.includes(field.fragment),'The production material injects the same GLSL tested on the GPU');
    for(const [key,uniform] of Object.entries(field.uniforms))assert.equal(shader.uniforms[key],uniform,'The rendered material shares the production field uniforms');
    const ownedGeometry=new Map([...geometries].map(geometry=>[geometry,geometryHash(geometry)]));
    const sources=()=>['nb1SourceOne','nb1SourceTwo'].map(key=>field.uniforms[key].value.toArray());
    const expectSources=(one,two)=>assert.deepEqual(sources(),[one,two].map(value=>new THREE.Color(value||'#000000').toArray()),'Canonical LED colors remain independent and are decoded into linear light');
    model.setColors('#ff0000','#0000ff','draft');
    assert.equal(upper.color.getHexString(),'ff0000');assert.equal(lower.color.getHexString(),'0000ff');
    assert.ok(upper.intensity>0&&lower.intensity>0);expectSources('#ff0000','#0000ff');
    const fixedSources=sources();
    model.group.rotation.x=Math.PI;model.group.updateMatrixWorld(true);model.setColors('#ff0000','#0000ff','accepted');
    assert.deepEqual(sources(),fixedSources,'Changing the object pose or draft/accepted label must not swap local source colors');
    assert.equal(upper.color.getHexString(),'ff0000');assert.equal(lower.color.getHexString(),'0000ff');
    model.setColors('#ff0000','#00ff00','draft');
    assert.equal(upper.color.getHexString(),'ff0000');assert.equal(lower.color.getHexString(),'00ff00');
    expectSources('#ff0000','#00ff00');
    model.setColors('#804020','#204080','preview');expectSources('#804020','#204080');
    model.setColors(null,'#0000ff','draft');
    assert.equal(upper.intensity,0);assert.ok(lower.intensity>0);expectSources(null,'#0000ff');
    model.setColors('#000000','#000000','draft');
    assert.equal(upper.intensity,0);assert.equal(lower.intensity,0);expectSources('#000000','#000000');
    model.setColors('#ff0000','#0000ff','none');
    assert.equal(upper.intensity,0);assert.equal(lower.intensity,0);
    expectSources(null,null);
    for(const [geometry,original] of ownedGeometry)assert.equal(geometryHash(geometry),original,'Color and pose changes cannot reshape or remap the continuous shell or USB assembly');
    assert.deepEqual(inputs.map(geometryHash),originals,'Color and pose updates preserve input CAD geometry');
    const disposedSources=sources();model.dispose();
    assert.equal(model.group.parent,null);assert.equal(model.group.children.length,0);
    assert.equal(inputDisposals,0,'The model must not dispose caller-owned CAD inputs');
    assert.ok(resources.length>10);for(const count of disposals.values())assert.equal(count,1,'Each owned resource is disposed once');
    model.dispose();model.setColors('#ffffff','#ffffff','accepted');
    assert.deepEqual(sources(),disposedSources,'A disposed model must not resume light-field updates');
    for(const count of disposals.values())assert.equal(count,1,'Repeated cleanup is harmless');
    assert.deepEqual(inputs.map(geometryHash),originals);
  }finally{model.dispose();for(const input of inputs)input.dispose();}
  console.log('PASS pure model: independent linear-light sources, shared production GLSL, fixed USB geometry, immutable CAD inputs and idempotent resource disposal');
}

modelContract();
